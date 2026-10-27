// demo/demo1-persistence-scrie.ts
//
// ===========================================================================
// DEMO 1: PERSISTENCE, PROCESUL A. Rulam un tichet si salvam fiecare pas.
// ===========================================================================
//
// Rulare:  pnpm demo1              (thread_id implicit: tichet-102)
//          pnpm demo1 tichet-200   (alt thread_id)
//
// CE FACE
//   Graful de triaj din Lab 12, compilat cu un checkpointer SqliteSaver.
//   Rulam tichetul de facturare pe un thread_id ales de noi. Procesul se
//   termina. Checkpoint-urile raman in date/checkpoints.sqlite.
//
// DE URMARIT
//   - Singura diferenta fata de Lab 12: compile({ checkpointer }) si al doilea
//     argument la invoke, config-ul cu thread_id.
//   - Dupa ce procesul se termina, rulati pnpm demo2: un PROCES NOU citeste
//     acelasi thread din fisier.

import "../lib/env";
import { createModel, readProviderFromEnv } from "../lib/llm";
import { titlu } from "../lib/afisare";
import { creeazaGrafTriaj } from "../lib/triaj/graf-triaj";
import { TICHETE } from "../lib/triaj/schema";
import { creeazaCheckpointer, configThread, FISIER_CHECKPOINTS } from "../lib/persistence";

const threadId = process.argv[2] ?? "tichet-102";

async function main() {
  const graf = creeazaGrafTriaj(createModel(readProviderFromEnv()), creeazaCheckpointer());

  titlu(`DEMO 1: procesul A ruleaza tichetul pe thread_id = ${threadId}`);
  console.log(`> ${TICHETE.facturare.text}\n`);

  const r = await graf.invoke({ ticket: TICHETE.facturare.text }, configThread(threadId));

  console.log("JURNAL (pasi):");
  for (const p of r.pasi) console.log(`  - ${p}`);
  console.log(`\nRASPUNS CLIENT:\n${r.raspunsClient}`);

  console.log(`\nCheckpoint-urile sunt in ${FISIER_CHECKPOINTS}. Procesul A se termina aici.`);
  console.log(`Urmatorul pas: pnpm demo2 ${threadId}   (un proces NOU citeste acelasi thread)`);
}

main().catch(console.error);
