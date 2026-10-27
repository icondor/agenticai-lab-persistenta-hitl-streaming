// exercitiu/schelet.ts
//
// ===========================================================================
// TEMA: omul poate schimba prioritatea, nu doar aproba sau respinge
// ===========================================================================
//
// Rulare:  pnpm tema:schelet
// Enuntul complet: exercitiu/Tema-Lab13.txt
//
// Azi omul de on-call raspunde doar "aprob" sau "resping". In realitate vrea
// de multe ori a treia varianta: «nu e urgent, dar nici nu e medie, e joasa».
// Faceti trei lucruri, marcate TODO 1, 2, 3. Graful NU se schimba: inlocuim
// doar nodul aprobare_oncall.

import "../lib/env";
import { createInterface } from "node:readline/promises";
import { Command, MemorySaver, interrupt, isInterrupted, INTERRUPT, type GraphNode } from "@langchain/langgraph";
import { z } from "zod";
import { createModel, readProviderFromEnv } from "../lib/llm";
import { titlu } from "../lib/afisare";
import { asambleazaGraf, noduriTriaj, StareTriaj } from "../lib/triaj/graf-triaj";
import { TICHETE, type CerereAprobare } from "../lib/triaj/schema";
import { configThread } from "../lib/persistence";

// TODO 1: schema raspunsului. Azi accepta doar "aprob" si "resping".
//         Trebuie sa accepte "aprob", "medie" si "joasa".
const DecizieCuEditare = z.enum(["aprob", "resping"]);

// TODO 2: nodul de aprobare.
//   - "aprob": intoarce { decizie: "aprob", pasi: [...] }, ca acum.
//   - "medie" sau "joasa": intoarce decizie: "resping" (asa ruteaza dupaAprobare
//     spre raspuns + nota, fara escaladare), triaj cu prioritatea aleasa de om
//     si o linie in pasi: "aprobare_oncall: prioritate schimbata in joasa".
const aprobareCuEditare: GraphNode<typeof StareTriaj> = async (s) => {
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
  // TODO 2: aici, in loc de "resping" fix, folositi prioritatea aleasa de om.
  return { decizie: "resping", triaj: { ...t, prioritate: "medie" }, pasi: ["aprobare_oncall: respins"] };
};

async function main() {
  const model = createModel(readProviderFromEnv());
  const graf = asambleazaGraf({ ...noduriTriaj(model), aprobareOncall: aprobareCuEditare }, new MemorySaver());
  const config = configThread(`tema-${Date.now()}`);

  titlu("TEMA: tichetul urgent");
  const r = await graf.invoke({ ticket: TICHETE.urgent.text }, config);
  if (!isInterrupted<CerereAprobare>(r)) {
    console.log("Modelul nu a clasificat tichetul ca urgent. Rulati din nou.");
    return;
  }
  const cerere = r[INTERRUPT][0].value as CerereAprobare;
  console.log(`${cerere.intrebare}\n  ${cerere.rezumat}`);

  // TODO 3: intrebarea din consola. Folositi DecizieCuEditare.safeParse si
  //         intrebati din nou pana primiti o valoare valida.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const text = (await rl.question("Decizia (aprob / resping): ")).trim().toLowerCase();
  rl.close();

  const final = await graf.invoke(new Command({ resume: text }), config);
  console.log("\nJURNAL:");
  for (const p of final.pasi) console.log(`  - ${p}`);
  console.log(`\nprioritate finala: ${final.triaj?.prioritate}   escaladat: ${final.escaladat}`);
  console.log(`\nRASPUNS CLIENT:\n${final.raspunsClient}`);
}

main().catch(console.error);
