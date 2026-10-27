// demo/demo5-streaming.ts
//
// ===========================================================================
// DEMO 5: STREAMING. Pasii, progresul si textul, pe masura ce graful ruleaza.
// ===========================================================================
//
// Rulare:  pnpm demo5           (tichetul urgent: se opreste si la aprobare)
//          pnpm demo5 idee      (tichetul fara urgenta, merge pana la capat)
//
// CE FACE
//   In loc de invoke, graph.stream(input, { streamMode: [...] }). Fiecare
//   eveniment vine ca pereche [mode, chunk]:
//     "updates"   un nod a terminat (sau graful s-a oprit: __interrupt__)
//     "messages"  tokenii modelului, cu metadata.langgraph_node
//     "custom"    mesajele trimise de noduri cu runtime.writer(...)
//   La interrupt va intreaba decizia si continua tot cu stream, cu Command.
//
// DE URMARIT
//   - Textul pentru client apare token cu token, nu la final.
//   - Tokenii din nota_interna NU ii afisam aici: cele doua noduri ruleaza
//     in paralel si textele s-ar amesteca pe ecran. In pagina web le punem
//     in doua casete separate.

import "../lib/env";
import { createInterface } from "node:readline/promises";
import { Command } from "@langchain/langgraph";
import { createModel, readProviderFromEnv } from "../lib/llm";
import { titlu } from "../lib/afisare";
import { creeazaGrafTriaj } from "../lib/triaj/graf-triaj";
import { TICHETE, Decizie } from "../lib/triaj/schema";
import type { Decizie as TipDecizie } from "../lib/triaj/schema";
import { creeazaCheckpointer, configThread } from "../lib/persistence";
import { traduce, STREAM_MODES } from "../lib/triaj/evenimente";

const alegere = (process.argv[2] ?? "urgent") as keyof typeof TICHETE;
const tichet = TICHETE[alegere] ?? TICHETE.urgent;

async function main() {
  const graf = creeazaGrafTriaj(createModel(readProviderFromEnv()), creeazaCheckpointer());
  const config = configThread(`stream-${Date.now()}`);

  titlu(`DEMO 5: streaming, tichetul «${alegere}»`);
  console.log(`> ${tichet.text}\n`);

  // undefined = prima tura (pornim tichetul); altfel = decizia pentru resume.
  let decizie: TipDecizie | undefined;

  // O bucla: stream pana la final sau pana la interrupt; la interrupt,
  // cerem decizia si pornim din nou stream-ul, cu Command({ resume }).
  while (true) {
    let scriuText = false;
    const optiuni = { ...config, streamMode: [...STREAM_MODES] };
    const stream = decizie
      ? await graf.stream(new Command({ resume: decizie }), optiuni) // resume
      : await graf.stream({ ticket: tichet.text }, optiuni); // prima tura

    for await (const [mode, chunk] of stream) {
      for (const ev of traduce(mode, chunk)) {
        if (ev.tip === "token" && ev.nod === "raspuns_client") {
          if (!scriuText) process.stdout.write("  [messages] raspuns_client: ");
          scriuText = true;
          process.stdout.write(ev.text);
          continue;
        }
        if (scriuText && ev.tip !== "token") {
          process.stdout.write("\n");
          scriuText = false;
        }
        if (ev.tip === "pas") console.log(`  [updates]  ${ev.nod}: ${ev.detaliu}`);
        if (ev.tip === "progres") console.log(`  [custom]   ${ev.text}`);
        if (ev.tip === "aprobare") console.log(`  [updates]  __interrupt__: ${ev.cerere.intrebare} (${ev.cerere.rezumat})`);
      }
    }
    if (scriuText) process.stdout.write("\n");

    const stare = await graf.getState(config);
    if (stare.next.length === 0) break; // graful a terminat

    // Graful asteapta: intrebam pana primim o decizie valida.
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let raspuns = Decizie.safeParse("");
    while (!raspuns.success) {
      raspuns = Decizie.safeParse((await rl.question("\nDecizia (aprob / resping): ")).trim().toLowerCase());
    }
    rl.close();
    decizie = raspuns.data;
    console.log();
  }

  titlu("Gata. Starea finala, din getState:");
  const final = await graf.getState(config);
  for (const p of final.values.pasi) console.log(`  - ${p}`);
}

main().catch(console.error);
