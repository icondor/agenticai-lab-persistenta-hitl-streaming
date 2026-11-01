// lib/triaj/graf-triaj.ts
//
// ===========================================================================
// GRAFUL DE TRIAJ, VERSIUNEA LAB 13: cel din Lab 12 + aprobare umana
// ===========================================================================
//
//   START -> clasifica -> valideaza -> (ruteaza, dupa prioritate)
//              urgenta      -> aprobare_oncall -> (dupaAprobare, dupa decizie)
//                                aprob   -> escaladeaza -> raspuns_client + nota_interna
//                                resping ->                raspuns_client + nota_interna
//              medie, joasa ->                             raspuns_client + nota_interna
//            raspuns_client + nota_interna (in paralel) -> finalizeaza -> END
//
// CE E LA FEL CA IN LAB 12
//   StateSchema, nodurile clasifica / valideaza / escaladeaza / raspuns_client /
//   nota_interna / finalizeaza, regula de business in cod, fan-out si fan-in,
//   jurnalul `pasi` cu reducer.
//
// CE E NOU IN LAB 13
//   interrupt(...)        nodul aprobare_oncall opreste graful si asteapta un om.
//   Command({ resume })   (in demo-uri si in ruta web) porneste graful mai departe.
//   checkpointer          compile({ checkpointer }). Fara el, interrupt da
//                         eroarea "No checkpointer set" (verificat).
//   runtime.writer(...)   mesaje de progres, vizibile in stream mode "custom".
//   decizie               camp nou in state: ce a hotarat omul.

import {
  StateGraph,
  StateSchema,
  ReducedValue,
  START,
  END,
  interrupt,
  type GraphNode,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import {
  schemaTriaj,
  Decizie,
  type Triaj,
  type CerereAprobare,
} from "./schema";
import { textulMesajului } from "../afisare";

export const StareTriaj = new StateSchema({
  ticket: z.string(),
  triaj: schemaTriaj.optional(), // completat de clasifica; se pune optional pentru ca initial nu exista triaj
  decizie: Decizie.optional(), // NOU: completat de aprobare_oncall; se pune optional pentru ca initial nu exista decizie
  raspunsClient: z.string().default(""),
  notaInterna: z.string().default(""),
  escaladat: z.boolean().default(false),
  // Jurnalul pasilor: fiecare nod adauga o linie. Reducer = concatenare.
  pasi: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      reducer: (existente: string[], noi: string[]) => [...existente, ...noi],
    },
  ),
});

/** Tonul raspunsului, ca in Lab 5: depinde de prioritate. */
export function tonPentru(prioritate: Triaj["prioritate"]): string {
  if (prioritate === "urgenta") return "empatic si rapid";
  if (prioritate === "medie") return "profesionist si clar";
  return "prietenos si concis";
}

/** Regula de business din Lab 12, in cod: facturarea nu e niciodata «joasa». */
export function aplicaReguli(t: Triaj): { triaj: Triaj; motiv?: string } {
  if (t.categorie === "facturare" && t.prioritate === "joasa") {
    return {
      triaj: { ...t, prioritate: "medie" },
      motiv: "facturare ridicata de la joasa la medie",
    };
  }
  return { triaj: t };
}

/** Rutare dupa valideaza. Fata de Lab 12, urgenta merge INTAI la aprobare. */
export function ruteaza(s: {
  triaj?: Triaj;
}): "aprobare_oncall" | ["raspuns_client", "nota_interna"] {
  return s.triaj?.prioritate === "urgenta" // daca e urgenta, merge intai la aprobare
    ? "aprobare_oncall"
    : ["raspuns_client", "nota_interna"]; //
}

/** NOU: rutare dupa aprobare. Un conditional edge obisnuit, pe campul decizie. */
export function dupaAprobare(s: {
  decizie?: Decizie;
}): "escaladeaza" | ["raspuns_client", "nota_interna"] {
  return s.decizie === "aprob"
    ? "escaladeaza"
    : ["raspuns_client", "nota_interna"];
}

/** Nodurile grafului, separat de legaturi (le refolosim in tema). */
export function noduriTriaj(model: BaseChatModel) {
  const clasificator = model.withStructuredOutput(schemaTriaj, {
    name: "triaj",
  });

  const clasifica: GraphNode<typeof StareTriaj> = async (s, runtime) => {
    runtime.writer?.({ progres: "clasific tichetul" }); // NOU: stream mode "custom"
    const triaj = (await clasificator.invoke([
      {
        role: "system",
        content:
          "Esti sistemul de triaj al unei echipe de suport. Clasifica tichetul. Fii strict cu prioritatea: " +
          '"urgenta" doar daca ceva e nefunctional sau blocheaza un client care plateste.',
      },
      { role: "user", content: `Tichet:\n${s.ticket}` },
    ])) as Triaj;
    return {
      triaj,
      pasi: [`clasifica: ${triaj.categorie}, ${triaj.prioritate}`],
    };
  };

  const valideaza: GraphNode<typeof StareTriaj> = async (s) => {
    const { triaj, motiv } = aplicaReguli(s.triaj!);
    return { triaj, pasi: [`valideaza: ${motiv ?? "fara modificari"}`] };
  };

  // -------------------------------------------------------------------------
  // NOU: human-in-the-loop. Graful se opreste aici si asteapta decizia.
  // -------------------------------------------------------------------------
  const aprobareOncall: GraphNode<typeof StareTriaj> = async (s, runtime) => {
    // CAPCANA (verificata): la resume, nodul ruleaza din nou DE LA INCEPUT.
    // Tot ce e scris inainte de interrupt() se executa de doua ori: o data la
    // pornire si o data la resume. De aceea aici NU trimitem emailuri si NU
    // scriem in baze de date. Linia de mai jos exista ca sa vedeti asta.
    console.log("  [aprobare_oncall] nodul ruleaza");
    runtime.writer?.({ progres: "astept decizia on-call" });

    const t = s.triaj!;
    const raspuns = interrupt<CerereAprobare, unknown>({
      intrebare: "Escaladam la on-call?",
      ticket: s.ticket,
      categorie: t.categorie,
      prioritate: t.prioritate,
      rezumat: t.rezumat,
    });

    // Ce vine din resume e input de la om: il validam ca pe orice input.
    const decizie = Decizie.parse(raspuns);
    if (decizie === "aprob") {
      return { decizie, pasi: ["aprobare_oncall: aprobat"] };
    }
    return {
      decizie,
      triaj: { ...t, prioritate: "medie" },
      pasi: ["aprobare_oncall: respins, prioritatea devine medie"],
    };
  };

  const escaladeaza: GraphNode<typeof StareTriaj> = async (_s, runtime) => {
    runtime.writer?.({ progres: "anunt on-call (PagerDuty)" });
    return {
      escaladat: true,
      pasi: ["escaladeaza: anunta on-call (PagerDuty)"],
    };
  };

  const raspunsClient: GraphNode<typeof StareTriaj> = async (s) => {
    const r = await model.invoke([
      {
        role: "system",
        content: `Esti agent de suport. Scrie un raspuns ${tonPentru(s.triaj!.prioritate)} catre client, in romana, maxim 4 propozitii. Nu inventa solutii tehnice.`,
      },
      {
        role: "user",
        content: `Rezumatul problemei: ${s.triaj!.rezumat}\nCategorie: ${s.triaj!.categorie}`,
      },
    ]);
    return {
      raspunsClient: textulMesajului(r),
      pasi: ["raspuns_client: gata"],
    };
  };

  const notaInterna: GraphNode<typeof StareTriaj> = async (s) => {
    const decizieOncall =
      s.decizie === "aprob"
        ? "aprobata"
        : s.decizie === "resping"
          ? "respinsa"
          : "nu a fost necesara";
    const statusEscaladare = s.escaladat ? "efectuata" : "nu a fost efectuata";
    const r = await model.invoke([
      {
        role: "system",
        // Promptul foloseste starea finala ca autoritate, nu deduce urgenta doar din descriere.
        content:
          "Scrie o nota interna scurta pentru echipa de suport: ce trebuie facut si cui se atribuie (dev/billing/support), maxim 2 propozitii. Trateaza prioritatea finala, decizia on-call si starea escaladarii din context ca autoritare; nu deduce o prioritate diferita din descriere si nu recomanda escaladarea daca nu a fost efectuata.",
      },
      {
        role: "user",
        content: `Categorie: ${s.triaj!.categorie}\nPrioritate finala: ${s.triaj!.prioritate}\nDecizie on-call: ${decizieOncall}\nEscaladare: ${statusEscaladare}\nProblema: ${s.triaj!.rezumat}`,
      },
    ]);
    // Adaugam statusul din state separat: formularea modelului nu este o sursa determinista.
    const statusHITL = `Decizie on-call: ${decizieOncall}. Escaladare: ${statusEscaladare}.`;
    return {
      notaInterna: `${textulMesajului(r)}\n${statusHITL}`,
      pasi: ["nota_interna: gata"],
    };
  };

  // Ruleaza o singura data, dupa ce AMBELE ramuri paralele s-au terminat.
  const finalizeaza: GraphNode<typeof StareTriaj> = async (s) => ({
    pasi: [
      `finalizeaza: ${s.raspunsClient ? "raspuns" : "FARA raspuns"} + ${s.notaInterna ? "nota" : "FARA nota"}`,
    ],
  });

  return {
    clasifica,
    valideaza,
    aprobareOncall,
    escaladeaza,
    raspunsClient,
    notaInterna,
    finalizeaza,
  };
}

export type NoduriTriaj = ReturnType<typeof noduriTriaj>;

/** Leaga nodurile intr-un graf si il compileaza cu checkpointer-ul primit. */
export function asambleazaGraf(
  n: NoduriTriaj,
  checkpointer?: BaseCheckpointSaver,
) {
  return new StateGraph(StareTriaj)
    .addNode("clasifica", n.clasifica)
    .addNode("valideaza", n.valideaza)
    .addNode("aprobare_oncall", n.aprobareOncall) // pe acest nod am pus interupt explicit pentru a simula aprobarea on-call
    .addNode("escaladeaza", n.escaladeaza)
    .addNode("raspuns_client", n.raspunsClient)
    .addNode("nota_interna", n.notaInterna)
    .addNode("finalizeaza", n.finalizeaza)
    .addEdge(START, "clasifica")
    .addEdge("clasifica", "valideaza")
    .addConditionalEdges("valideaza", ruteaza, [
      "aprobare_oncall",
      "raspuns_client",
      "nota_interna",
    ])
    .addConditionalEdges("aprobare_oncall", dupaAprobare, [
      "escaladeaza",
      "raspuns_client",
      "nota_interna",
    ])
    .addEdge("escaladeaza", "raspuns_client")
    .addEdge("escaladeaza", "nota_interna")
    .addEdge(["raspuns_client", "nota_interna"], "finalizeaza") // fan-in: asteapta ambele
    .addEdge("finalizeaza", END)
    .compile({ checkpointer }); // NOU: checkpointer-ul se da la compile
}

export function creeazaGrafTriaj(
  model: BaseChatModel,
  checkpointer?: BaseCheckpointSaver,
) {
  return asambleazaGraf(noduriTriaj(model), checkpointer);
}

export type GrafTriaj = ReturnType<typeof creeazaGrafTriaj>;
