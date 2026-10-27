// lib/triaj/evenimente.ts
//
// ===========================================================================
// DIN STREAM-UL GRAFULUI, IN EVENIMENTE PENTRU CONSOLA SI PENTRU BROWSER
// ===========================================================================
//
// graph.stream(input, { streamMode: ["updates", "messages", "custom"] })
// produce perechi [mode, chunk]. Fiecare mod are alta forma:
//
//   "updates"   { numeNod: ce a intors nodul }        un eveniment pe nod
//               { __interrupt__: [ { value } ] }        cand graful se opreste
//   "messages"  [ bucataDeMesaj, metadata ]            tokenii modelului;
//               metadata.langgraph_node spune din ce nod vin
//   "custom"    ce a trimis nodul cu runtime.writer(...)
//
// Functia `traduce` le transforma intr-un singur tip, Eveniment. O folosesc si
// demo5 (consola), si ruta web (SSE), si testele. Nu cheama niciun model.

import { textulBucatii } from "../afisare";
import type { CerereAprobare, Triaj } from "./schema";

export const STREAM_MODES = ["updates", "messages", "custom"] as const;

/** Nodurile al caror text il afisam token cu token. */
export const NODURI_CU_TEXT = ["raspuns_client", "nota_interna"] as const;
type NodCuText = (typeof NODURI_CU_TEXT)[number];

export type Eveniment =
  | { tip: "pas"; nod: string; detaliu: string }
  | { tip: "progres"; text: string }
  | { tip: "token"; nod: NodCuText; text: string }
  | { tip: "aprobare"; cerere: CerereAprobare }
  | { tip: "gata"; triaj?: Triaj; escaladat: boolean; raspunsClient: string; notaInterna: string; pasi: string[] }
  | { tip: "eroare"; mesaj: string };

export function traduce(mode: string, chunk: unknown): Eveniment[] {
  if (mode === "updates") {
    return Object.entries(chunk as Record<string, unknown>).map(([nod, update]): Eveniment => {
      if (nod === "__interrupt__") {
        const [primul] = update as { value: CerereAprobare }[];
        return { tip: "aprobare", cerere: primul.value };
      }
      const pasi = (update as { pasi?: string[] } | null)?.pasi ?? [];
      return { tip: "pas", nod, detaliu: pasi.join("; ") };
    });
  }

  if (mode === "custom") {
    const { progres } = chunk as { progres?: string };
    return progres ? [{ tip: "progres", text: progres }] : [];
  }

  if (mode === "messages") {
    // Atentie: si clasifica cheama modelul (structured output), deci si de
    // acolo vin bucati, cu argumentele JSON ale tool call-ului. Le filtram
    // dupa nod, altfel in interfata ar aparea bucati de JSON.
    const [bucata, metadata] = chunk as [{ content: unknown }, { langgraph_node?: string }];
    const nod = metadata?.langgraph_node as NodCuText | undefined;
    if (!nod || !NODURI_CU_TEXT.includes(nod)) return [];
    const text = textulBucatii(bucata.content);
    return text ? [{ tip: "token", nod, text }] : [];
  }

  return [];
}
