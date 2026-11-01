// verificare/test-lab13.ts
//
// ===========================================================================
// VERIFICARE: Lab 13. Fara chei, cu modele false.
// ===========================================================================
//
// Rulare:  pnpm verifica
//
// Demo-urile cer un model real. Aici verificam MECANISMUL: checkpointer,
// thread_id, interrupt, resume, re-executarea nodului, stream modes,
// SqliteSaver intre doua instante, tema. Calitatea clasificarii unui model
// real NU se verifica aici.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Command,
  MemorySaver,
  isInterrupted,
  INTERRUPT,
} from "@langchain/langgraph";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { RunnableLambda } from "@langchain/core/runnables";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  creeazaGrafTriaj,
  ruteaza,
  dupaAprobare,
} from "../lib/triaj/graf-triaj";
import type { CerereAprobare, Triaj } from "../lib/triaj/schema";
import { creeazaCheckpointer, configThread } from "../lib/persistence";
import { traduce, STREAM_MODES, type Eveniment } from "../lib/triaj/evenimente";
import { creeazaGrafCuEditare, DecizieCuEditare } from "../exercitiu/referinta";

let trecute = 0;
let picate = 0;
function verifica(nume: string, conditie: boolean, detaliu?: unknown) {
  if (conditie) {
    trecute++;
    console.log(`  ok    ${nume}`);
  } else {
    picate++;
    console.log(
      `  PICAT ${nume}${detaliu !== undefined ? `   (${JSON.stringify(detaliu)})` : ""}`,
    );
  }
}
async function aruncaEroare(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Model fals: clasificarea e fixa (structured output), iar textele vin din
 * FakeListChatModel, care face streaming caracter cu caracter. Asa putem
 * verifica si stream mode "messages" fara cheie.
 */
class ModelFals extends FakeListChatModel {
  constructor(private triaj: Triaj) {
    super({
      responses: [
        "Ne pare rau, investigam acum.",
        "Nota: verificati serverul.",
      ],
    });
  }
  // @ts-expect-error: in test intoarcem direct clasificarea, fara tool calling
  withStructuredOutput() {
    return RunnableLambda.from(async () => this.triaj);
  }
}
const model = (
  prioritate: Triaj["prioritate"],
  categorie: Triaj["categorie"] = "bug",
) =>
  new ModelFals({
    categorie,
    prioritate,
    rezumat: "Platforma nu porneste",
  }) as unknown as BaseChatModel;

async function main() {
  console.log("\nA. Structura grafului");
  {
    const g = creeazaGrafTriaj(model("medie"));
    const m = (await g.getGraphAsync()).drawMermaid();
    verifica(
      "valideaza -.-> aprobare_oncall (conditional edge)",
      m.includes("valideaza -.-> aprobare_oncall"),
      m,
    );
    verifica(
      "aprobare_oncall -.-> escaladeaza (conditional edge)",
      m.includes("aprobare_oncall -.-> escaladeaza"),
    );
    verifica(
      "ruteaza: urgenta merge la aprobare",
      ruteaza({
        triaj: { categorie: "bug", prioritate: "urgenta", rezumat: "" },
      }) === "aprobare_oncall",
    );
    verifica(
      "dupaAprobare: aprob merge la escaladeaza",
      dupaAprobare({ decizie: "aprob" }) === "escaladeaza",
    );
    verifica(
      "dupaAprobare: resping merge la raspuns + nota",
      JSON.stringify(dupaAprobare({ decizie: "resping" })) ===
        '["raspuns_client","nota_interna"]',
    );
  }

  console.log("\nB. Erorile de configurare (mesajele din slide)");
  {
    const fara = await aruncaEroare(() =>
      creeazaGrafTriaj(model("urgenta")).invoke({ ticket: "x" }),
    );
    verifica(
      "interrupt fara checkpointer: No checkpointer set",
      fara.includes("No checkpointer set"),
      fara,
    );
    const faraThread = await aruncaEroare(() =>
      creeazaGrafTriaj(model("medie"), new MemorySaver()).invoke({
        ticket: "x",
      }),
    );
    verifica(
      "checkpointer fara thread_id: eroarea numeste thread_id",
      faraThread.includes("thread_id"),
      faraThread.slice(0, 120),
    );
  }

  console.log("\nC. Persistence: un checkpoint pe super-step");
  {
    const g = creeazaGrafTriaj(model("medie"), new MemorySaver());
    const cfg = configThread("c1");
    const r = await g.invoke({ ticket: "Ar fi util un export" }, cfg);
    verifica(
      "tichetul normal merge pana la capat",
      r.pasi.at(-1)?.startsWith("finalizeaza") === true,
      r.pasi,
    );
    const istoric = [];
    for await (const cp of g.getStateHistory(cfg)) istoric.unshift(cp);
    verifica(
      "6 checkpoint-uri: input + 4 super-step-uri + final",
      istoric.length === 6,
      istoric.map((c) => c.next),
    );
    verifica(
      "raspuns_client si nota_interna: acelasi checkpoint (acelasi super-step)",
      istoric.some(
        (c) =>
          c.next.length === 2 &&
          c.next.includes("raspuns_client") &&
          c.next.includes("nota_interna"),
      ),
    );
    const st = await g.getState(cfg);
    verifica("getState la final: next gol", st.next.length === 0, st.next);
    const alt = await g.getState(configThread("alt-thread"));
    verifica(
      "alt thread_id: stare goala",
      alt.values.ticket === undefined,
      alt.values,
    );
  }

  console.log("\nD. Human-in-the-loop: interrupt si resume (MemorySaver)");
  {
    const g = creeazaGrafTriaj(model("urgenta"), new MemorySaver());
    const cfg = configThread("d1");
    const r = await g.invoke({ ticket: "Platforma nu porneste" }, cfg);
    verifica(
      "invoke se intoarce cu __interrupt__",
      isInterrupted<CerereAprobare>(r),
    );
    if (isInterrupted<CerereAprobare>(r)) {
      const v = r[INTERRUPT][0].value as CerereAprobare;
      verifica(
        "valoarea din interrupt: intrebare + prioritate",
        v.intrebare.includes("on-call") && v.prioritate === "urgenta",
        v,
      );
    }
    const st = await g.getState(cfg);
    verifica(
      "getState: next = [aprobare_oncall]",
      JSON.stringify(st.next) === '["aprobare_oncall"]',
      st.next,
    );
    verifica("escaladeaza NU a rulat inca", st.values.escaladat === false);

    const fin = await g.invoke(new Command({ resume: "aprob" }), cfg);
    verifica("aprob: escaladat = true", fin.escaladat === true, fin.pasi);
    verifica(
      "aprob: jurnalul contine aprobarea si escaladarea",
      fin.pasi.includes("aprobare_oncall: aprobat") &&
        fin.pasi.some((p) => p.startsWith("escaladeaza")),
      fin.pasi,
    );
    verifica(
      "aprob: nota confirma decizia si escaladarea",
      fin.notaInterna.includes(
        "Decizie on-call: aprobata. Escaladare: efectuata.",
      ),
      fin.notaInterna,
    );
    verifica(
      "finalizeaza apare o singura data",
      fin.pasi.filter((p) => p.startsWith("finalizeaza")).length === 1,
      fin.pasi,
    );

    const g2 = creeazaGrafTriaj(model("urgenta"), new MemorySaver());
    const cfg2 = configThread("d2");
    await g2.invoke({ ticket: "Platforma nu porneste" }, cfg2);
    const res = await g2.invoke(new Command({ resume: "resping" }), cfg2);
    verifica(
      "resping: fara escaladare",
      res.escaladat === false &&
        !res.pasi.some((p) => p.startsWith("escaladeaza")),
      res.pasi,
    );
    verifica(
      "resping: prioritatea devine medie",
      res.triaj?.prioritate === "medie",
      res.triaj,
    );
    verifica(
      "resping: nota confirma decizia si lipsa escaladarii",
      res.notaInterna.includes(
        "Decizie on-call: respinsa. Escaladare: nu a fost efectuata.",
      ),
      res.notaInterna,
    );

    const g3 = creeazaGrafTriaj(model("urgenta"), new MemorySaver());
    const cfg3 = configThread("d3");
    await g3.invoke({ ticket: "x" }, cfg3);
    const gresit = await aruncaEroare(() =>
      g3.invoke(new Command({ resume: "poate" }), cfg3),
    );
    verifica(
      "decizie invalida: eroare de validare (Zod)",
      gresit.length > 0,
      gresit.slice(0, 80),
    );
  }

  console.log(
    "\nE. SqliteSaver: doua instante, acelasi fisier (ca doua procese)",
  );
  {
    const dir = mkdtempSync(join(tmpdir(), "lab13-"));
    const fisier = join(dir, "checkpoints.sqlite");
    const cfg = configThread("tichet-101");
    const a = creeazaGrafTriaj(model("urgenta"), creeazaCheckpointer(fisier));
    await a.invoke({ ticket: "Platforma nu porneste" }, cfg);
    const b = creeazaGrafTriaj(model("urgenta"), creeazaCheckpointer(fisier)); // instanta noua, ca un proces nou
    const st = await b.getState(cfg);
    verifica(
      "instanta B vede thread-ul oprit la aprobare",
      st.next.includes("aprobare_oncall"),
      st.next,
    );
    verifica(
      "instanta B vede valoarea din interrupt",
      (st.tasks[0]?.interrupts[0]?.value as CerereAprobare | undefined)
        ?.prioritate === "urgenta",
    );
    const fin = await b.invoke(new Command({ resume: "aprob" }), cfg);
    verifica(
      "instanta B duce graful pana la capat",
      fin.escaladat === true &&
        fin.pasi.at(-1)?.startsWith("finalizeaza") === true,
      fin.pasi,
    );
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("\nF. Streaming si capcana re-executarii");
  {
    const g = creeazaGrafTriaj(model("urgenta"), new MemorySaver());
    const cfg = configThread("f1");
    const ev1: Eveniment[] = [];
    for await (const [mode, chunk] of await g.stream(
      { ticket: "Platforma nu porneste" },
      { ...cfg, streamMode: [...STREAM_MODES] },
    )) {
      ev1.push(...traduce(mode, chunk));
    }
    verifica(
      "updates: pas pentru clasifica",
      ev1.some((e) => e.tip === "pas" && e.nod === "clasifica"),
      ev1,
    );
    verifica(
      "custom: progresul din runtime.writer",
      ev1.some((e) => e.tip === "progres" && e.text === "clasific tichetul"),
    );
    verifica(
      "updates: __interrupt__ devine eveniment aprobare",
      ev1.some((e) => e.tip === "aprobare"),
    );

    const ev2: Eveniment[] = [];
    for await (const [mode, chunk] of await g.stream(
      new Command({ resume: "aprob" }),
      { ...cfg, streamMode: [...STREAM_MODES] },
    )) {
      ev2.push(...traduce(mode, chunk));
    }
    const tokeni = ev2.filter(
      (e) => e.tip === "token" && e.nod === "raspuns_client",
    ).length;
    verifica(
      "messages: textul vine in mai multe bucati (tokeni)",
      tokeni > 3,
      tokeni,
    );
    verifica(
      "messages: tokenii au nodul corect",
      ev2
        .filter((e) => e.tip === "token")
        .every(
          (e) =>
            e.tip === "token" &&
            ["raspuns_client", "nota_interna"].includes(e.nod),
        ),
    );
    const asteptari = [...ev1, ...ev2].filter(
      (e) => e.tip === "progres" && e.text === "astept decizia on-call",
    ).length;
    verifica(
      "nodul cu interrupt a rulat de 2 ori (pornire + resume)",
      asteptari === 2,
      asteptari,
    );
  }

  console.log("\nG. traduce: bucatile din clasifica nu ajung in interfata");
  {
    const ev = traduce("messages", [
      { content: '{"categorie":' },
      { langgraph_node: "clasifica" },
    ]);
    verifica("token din clasifica: ignorat", ev.length === 0, ev);
    const ok = traduce("messages", [
      { content: [{ type: "text", text: " Buna" }] },
      { langgraph_node: "raspuns_client" },
    ]);
    verifica(
      "blocuri de text: spatiul de la inceput se pastreaza",
      ok.length === 1 && ok[0].tip === "token" && ok[0].text === " Buna",
      ok,
    );
  }

  console.log("\nH. Tema: prioritatea aleasa de om");
  {
    const g = creeazaGrafCuEditare(model("urgenta"), new MemorySaver());
    const cfg = configThread("h1");
    await g.invoke({ ticket: "Platforma nu porneste" }, cfg);
    const fin = await g.invoke(new Command({ resume: "joasa" }), cfg);
    verifica(
      "joasa: prioritatea finala joasa, fara escaladare",
      fin.triaj?.prioritate === "joasa" && fin.escaladat === false,
      fin.pasi,
    );
    verifica(
      "joasa: linia din jurnal",
      fin.pasi.includes("aprobare_oncall: prioritate schimbata in joasa"),
      fin.pasi,
    );
    verifica(
      "schema temei accepta exact trei valori",
      DecizieCuEditare.options.join(",") === "aprob,medie,joasa",
    );
  }

  console.log(`\n${trecute} trecute, ${picate} picate`);
  if (picate > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
