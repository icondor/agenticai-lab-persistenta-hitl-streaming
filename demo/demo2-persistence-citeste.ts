// demo/demo2-persistence-citeste.ts
//
// ===========================================================================
// DEMO 2: PERSISTENCE, PROCESUL B. Alt proces citeste acelasi thread.
// ===========================================================================
//
// Rulare:  pnpm demo2              (thread_id implicit: tichet-102, scris de demo1)
//          pnpm demo2 tichet-101   (thread-ul oprit de demo3)
//
// CE FACE
//   Nu ruleaza niciun nod si nu cheama modelul. Deschide acelasi fisier SQLite
//   si citeste:
//     1. getState(config): ultimul checkpoint al thread-ului (StateSnapshot).
//     2. getStateHistory(config): toate checkpoint-urile, cate unul pe super-step.
//
// DE URMARIT
//   - values: starea completa, exact cum a lasat-o procesul A.
//   - next: ce nod urmeaza. Gol = graful a terminat. ["aprobare_oncall"] =
//     graful asteapta un om (vezi demo3).
//   - In istoric, raspuns_client si nota_interna apar in ACELASI checkpoint:
//     au rulat in acelasi super-step.

import "../lib/env";
import { createModel, readProviderFromEnv } from "../lib/llm";
import { titlu } from "../lib/afisare";
import { creeazaGrafTriaj } from "../lib/triaj/graf-triaj";
import { creeazaCheckpointer, configThread } from "../lib/persistence";

const threadId = process.argv[2] ?? "tichet-102";

async function main() {
  // Modelul e necesar ca sa construim graful, dar aici nu il chemam deloc.
  const graf = creeazaGrafTriaj(
    createModel(readProviderFromEnv()),
    creeazaCheckpointer(),
  );
  const config = configThread(threadId);

  titlu(`DEMO 2: procesul B citeste thread_id = ${threadId}`);
  const stare = await graf.getState(config);

  if (!stare.values.ticket) {
    //altfel ar incerca sa acceseze proprietati ale unui ticket inexistent
    console.log(
      "Thread-ul nu exista inca. Rulati intai pnpm demo1 (sau pnpm demo3).",
    );
    return;
  }

  console.log("getState(config).values:");
  console.log(`  ticket:   ${stare.values.ticket}`);
  console.log(`  triaj:    ${JSON.stringify(stare.values.triaj)}`);
  console.log(`  pasi:     ${stare.values.pasi.length} linii in jurnal`);
  console.log(
    `getState(config).next: ${JSON.stringify(stare.next)}  ${stare.next.length === 0 ? "(graful a terminat)" : "(graful asteapta)"}`,
  );

  titlu("Checkpoint-urile thread-ului: unul pe super-step");
  const linii: string[] = [];
  for await (const cp of graf.getStateHistory(config)) {
    const urmeaza = cp.next.length ? cp.next.join(" + ") : "(nimic: final)";
    linii.unshift(
      // adaugam la inceput pentru a avea ordinea inversa a super-step-urilor
      `  step ${String(cp.metadata?.step).padStart(2)}   urmeaza: ${urmeaza}`,
      // metadata.step este indexul intern al checkpoint-ului in LangGraph.
      // Thread-ul incepe cu step -1 (input-ul initial), apoi indexul creste;
      // step 0 are deja clasifica drept urmatorul nod.
    );
  }
  for (const l of linii) console.log(l);
  console.log(
    `\nTotal: ${linii.length} checkpoint-uri. Step -1 este input-ul.`,
  );
}

main().catch(console.error);
