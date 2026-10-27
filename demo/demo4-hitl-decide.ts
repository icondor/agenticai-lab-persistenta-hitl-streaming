// demo/demo4-hitl-decide.ts
//
// ===========================================================================
// DEMO 4: RESUME. Omul decide, din alt proces, «a doua zi».
// ===========================================================================
//
// Rulare:  pnpm demo4              (thread_id implicit: tichet-101, oprit de demo3)
//          pnpm demo4 tichet-300
//
// CE FACE
//   1. getState: graful e oprit? next trebuie sa fie ["aprobare_oncall"].
//   2. Va intreaba in consola: aprob sau resping.
//   3. invoke(new Command({ resume: decizia }), config): graful continua
//      exact de unde a ramas, pe acelasi thread_id.
//
// DE URMARIT
//   - Linia "[aprobare_oncall] nodul ruleaza" apare INCA O DATA: la resume,
//     nodul se executa de la inceput. interrupt() intoarce acum decizia.
//   - aprob   -> jurnalul contine escaladeaza, escaladat = true.
//   - resping -> fara escaladeaza, prioritatea devine medie, alt ton in raspuns.

import "../lib/env";
import { createInterface } from "node:readline/promises";
import { Command } from "@langchain/langgraph";
import { createModel, readProviderFromEnv } from "../lib/llm";
import { titlu } from "../lib/afisare";
import { creeazaGrafTriaj } from "../lib/triaj/graf-triaj";
import { Decizie, type CerereAprobare } from "../lib/triaj/schema";
import { creeazaCheckpointer, configThread } from "../lib/persistence";

const threadId = process.argv[2] ?? "tichet-101";

async function main() {
  const graf = creeazaGrafTriaj(createModel(readProviderFromEnv()), creeazaCheckpointer());
  const config = configThread(threadId);

  const stare = await graf.getState(config);
  if (!stare.next.includes("aprobare_oncall")) {
    console.log(`Thread-ul ${threadId} nu asteapta o aprobare (next = ${JSON.stringify(stare.next)}).`);
    console.log("Rulati intai pnpm demo3.");
    return;
  }

  // Valoarea data lui interrupt() e salvata in checkpoint, in tasks.
  const cerere = stare.tasks[0].interrupts[0].value as CerereAprobare;
  titlu(`DEMO 4: thread_id = ${threadId} asteapta decizia`);
  console.log(`  ${cerere.intrebare}`);
  console.log(`  categorie: ${cerere.categorie}, prioritate: ${cerere.prioritate}`);
  console.log(`  rezumat:   ${cerere.rezumat}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const text = (await rl.question("Decizia (aprob / resping): ")).trim().toLowerCase();
  rl.close();
  const decizie = Decizie.safeParse(text);
  if (!decizie.success) {
    console.log(`"${text}" nu e o decizie valida. Graful ramane oprit; rulati din nou.`);
    return;
  }

  console.log();
  const r = await graf.invoke(new Command({ resume: decizie.data }), config);

  titlu("Graful a continuat de unde ramasese");
  console.log("JURNAL complet:");
  for (const p of r.pasi) console.log(`  - ${p}`);
  console.log(`\nescaladat: ${r.escaladat}   prioritate finala: ${r.triaj?.prioritate}`);
  console.log(`\nRASPUNS CLIENT:\n${r.raspunsClient}`);
}

main().catch(console.error);
