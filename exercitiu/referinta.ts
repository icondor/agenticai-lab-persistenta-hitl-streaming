// exercitiu/referinta.ts
//
// ===========================================================================
// TEMA, REZOLVAREA: omul poate schimba prioritatea, nu doar aproba sau respinge
// ===========================================================================
//
// Rulare:  pnpm tema
//
// Enuntul: exercitiu/Tema-Lab13.txt. Pornire: exercitiu/schelet.ts.
//
// IDEEA
//   La interrupt, omul raspunde cu una din trei valori:
//     "aprob"  -> escaladeaza, ca pana acum
//     "medie"  -> nu escaladeaza, prioritatea devine medie
//     "joasa"  -> nu escaladeaza, prioritatea devine joasa (alt ton in raspuns)
//   Graful NU se schimba: inlocuim doar nodul aprobare_oncall. Campul decizie
//   din state ramane "aprob" sau "resping", deci dupaAprobare merge la fel.

import "../lib/env";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { Command, MemorySaver, interrupt, isInterrupted, INTERRUPT, type GraphNode, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { createModel, readProviderFromEnv } from "../lib/llm";
import { titlu } from "../lib/afisare";
import { asambleazaGraf, noduriTriaj, StareTriaj } from "../lib/triaj/graf-triaj";
import { TICHETE, type CerereAprobare } from "../lib/triaj/schema";
import { configThread } from "../lib/persistence";

/** TODO 1, rezolvat: cele trei raspunsuri posibile. */
export const DecizieCuEditare = z.enum(["aprob", "medie", "joasa"]);

/** TODO 2, rezolvat: nodul de aprobare care accepta si o prioritate noua. */
export const aprobareCuEditare: GraphNode<typeof StareTriaj> = async (s) => {
  const t = s.triaj!;
  const raspuns = interrupt<CerereAprobare, unknown>({
    intrebare: "Escaladam la on-call? (aprob / medie / joasa)",
    ticket: s.ticket,
    categorie: t.categorie,
    prioritate: t.prioritate,
    rezumat: t.rezumat,
  });

  const decizie = DecizieCuEditare.parse(raspuns);
  if (decizie === "aprob") {
    return { decizie: "aprob", pasi: ["aprobare_oncall: aprobat"] };
  }
  return {
    decizie: "resping",
    triaj: { ...t, prioritate: decizie },
    pasi: [`aprobare_oncall: prioritate schimbata in ${decizie}`],
  };
};

export function creeazaGrafCuEditare(model: BaseChatModel, checkpointer?: BaseCheckpointSaver) {
  return asambleazaGraf({ ...noduriTriaj(model), aprobareOncall: aprobareCuEditare }, checkpointer);
}

async function main() {
  // Aici MemorySaver ajunge: pornirea si decizia sunt in acelasi proces.
  const graf = creeazaGrafCuEditare(createModel(readProviderFromEnv()), new MemorySaver());
  const config = configThread(`tema-${Date.now()}`);

  titlu("TEMA: tichetul urgent, cu optiunea de a schimba prioritatea");
  const r = await graf.invoke({ ticket: TICHETE.urgent.text }, config);
  if (!isInterrupted<CerereAprobare>(r)) {
    console.log("Modelul nu a clasificat tichetul ca urgent. Rulati din nou.");
    return;
  }
  const cerere = r[INTERRUPT][0].value as CerereAprobare;
  console.log(`${cerere.intrebare}\n  ${cerere.rezumat}`);

  // TODO 3, rezolvat: consola accepta cele trei valori.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let decizie = DecizieCuEditare.safeParse("");
  while (!decizie.success) {
    decizie = DecizieCuEditare.safeParse((await rl.question("Decizia (aprob / medie / joasa): ")).trim().toLowerCase());
  }
  rl.close();

  const final = await graf.invoke(new Command({ resume: decizie.data }), config);
  console.log("\nJURNAL:");
  for (const p of final.pasi) console.log(`  - ${p}`);
  console.log(`\nprioritate finala: ${final.triaj?.prioritate}   escaladat: ${final.escaladat}`);
  console.log(`\nRASPUNS CLIENT:\n${final.raspunsClient}`);
}

// Ruleaza main doar cand fisierul e pornit direct (pnpm tema), nu cand e importat in teste.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(console.error);
}
