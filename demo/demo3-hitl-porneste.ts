// demo/demo3-hitl-porneste.ts
//
// ===========================================================================
// DEMO 3: HUMAN-IN-THE-LOOP. Tichetul urgent opreste graful.
// ===========================================================================
//
// Rulare:  pnpm demo3              (thread_id implicit: tichet-101)
//          pnpm demo3 tichet-300   (alt thread_id)
//
// CE FACE
//   Rulam tichetul urgent. Dupa valideaza, ruta duce la aprobare_oncall, unde
//   interrupt() opreste graful. invoke se intoarce, iar procesul se termina.
//   Decizia o dam din ALT proces, cu pnpm demo4.
//
// DE URMARIT
//   - Rezultatul lui invoke contine __interrupt__: ce ii aratam omului.
//   - isInterrupted(r) verifica asta si ii spune lui TypeScript forma datelor.
//   - Linia "[aprobare_oncall] nodul ruleaza" apare O DATA aici. La resume,
//     in demo4, o veti vedea inca o data. Asta e capcana din slide.

import "../lib/env";
import { isInterrupted, INTERRUPT } from "@langchain/langgraph";
import { createModel, readProviderFromEnv } from "../lib/llm";
import { titlu } from "../lib/afisare";
import { creeazaGrafTriaj } from "../lib/triaj/graf-triaj";
import { TICHETE, type CerereAprobare } from "../lib/triaj/schema";
import { creeazaCheckpointer, configThread } from "../lib/persistence";

const threadId = process.argv[2] ?? "tichet-101";

async function main() {
  const graf = creeazaGrafTriaj(
    createModel(readProviderFromEnv()),
    creeazaCheckpointer(),
  );

  titlu(`DEMO 3: tichetul urgent, thread_id = ${threadId}`);
  console.log(`> ${TICHETE.urgent.text}\n`);

  const r = await graf.invoke(
    { ticket: TICHETE.urgent.text },
    configThread(threadId),
  );

  console.log("\nJURNAL pana acum:");
  for (const p of r.pasi) console.log(`  - ${p}`);

  if (!isInterrupted<CerereAprobare>(r)) {
    console.log(
      "\nModelul nu a clasificat tichetul ca urgent, deci graful nu s-a oprit.",
    );
    console.log(
      "Comportamentul modelului variaza. Rulati din nou, cu alt thread_id.",
    );
    return;
  }

  // value e tipizat optional; aici stim ca nodul a trimis o CerereAprobare.
  const cerere = r[INTERRUPT][0].value as CerereAprobare;
  titlu("Graful s-a oprit. Asta vede omul de on-call:");
  console.log(`  ${cerere.intrebare}`);
  console.log(
    `  categorie: ${cerere.categorie}, prioritate: ${cerere.prioritate}`,
  );
  console.log(`  rezumat:   ${cerere.rezumat}`);
  console.log(`\nStarea e salvata. Procesul se termina aici.`);
  console.log(`Decizia, din alt proces:  pnpm demo4 ${threadId}`);
}

main().catch(console.error);
