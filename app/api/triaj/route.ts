// app/api/triaj/route.ts
//
// ===========================================================================
// O RUTA PENTRU DOUA CERERI: «porneste tichetul» si «iata decizia»
// ===========================================================================
//
//   POST { threadId, ticket }   -> graph.stream({ ticket }, ...)
//   POST { threadId, decizie }  -> graph.stream(new Command({ resume: decizie }), ...)
//
// Raspunsul e un stream SSE, exact ca in Lab 1 si Lab 11: linii
// "data: {json}\n\n". Fiecare eveniment vine din traduce() (lib/triaj/evenimente.ts).
//
// DE CE MERGE INTRE DOUA CERERI HTTP
//   Prima cerere se termina cand graful se opreste la interrupt. A doua cerere
//   e alt request, eventual peste ore. Legatura dintre ele e thread_id-ul,
//   iar starea sta in SqliteSaver, nu in memoria serverului.

import { NextRequest } from "next/server";
import { Command } from "@langchain/langgraph";
import { z } from "zod";
import { createModel, readProviderFromEnv } from "@/lib/llm";
import { creeazaGrafTriaj, type GrafTriaj } from "@/lib/triaj/graf-triaj";
import { Decizie } from "@/lib/triaj/schema";
import { creeazaCheckpointer, configThread } from "@/lib/persistence";
import { traduce, STREAM_MODES, type Eveniment } from "@/lib/triaj/evenimente";

export const runtime = "nodejs";

const Cerere = z.union([
  z.object({ threadId: z.string().min(1), ticket: z.string().min(3) }),
  z.object({ threadId: z.string().min(1), decizie: Decizie }),
]);

// Un singur graf pe server. In dezvoltare Next reincarca modulele la fiecare
// modificare, asa ca il tinem pe globalThis, ca in Lab 11.
const g = globalThis as unknown as { grafTriaj?: GrafTriaj };
function graf(): GrafTriaj {
  g.grafTriaj ??= creeazaGrafTriaj(createModel(readProviderFromEnv()), creeazaCheckpointer());
  return g.grafTriaj;
}

export async function POST(request: NextRequest) {
  const corp = Cerere.safeParse(await request.json().catch(() => null));
  if (!corp.success) {
    return Response.json({ error: "Cerere invalida" }, { status: 400 });
  }
  const cerere = corp.data;
  const config = configThread(cerere.threadId);

  // Un resume are sens doar daca thread-ul chiar asteapta o aprobare.
  if ("decizie" in cerere) {
    const stare = await graf().getState(config);
    if (!stare.next.includes("aprobare_oncall")) {
      return Response.json({ error: "Thread-ul nu asteapta o aprobare" }, { status: 409 });
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const emite = (ev: Eveniment) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          // clientul a inchis pagina
        }
      };

      try {
        // Prima cerere porneste tichetul; a doua continua graful cu decizia omului.
        const optiuni = { ...config, streamMode: [...STREAM_MODES] };
        const evenimente =
          "ticket" in cerere
            ? await graf().stream({ ticket: cerere.ticket }, optiuni)
            : await graf().stream(new Command({ resume: cerere.decizie }), optiuni);
        for await (const [mode, chunk] of evenimente) {
          for (const ev of traduce(mode, chunk)) emite(ev);
        }

        // Graful s-a terminat sau s-a oprit? Raspunsul e in checkpoint.
        const stare = await graf().getState(config);
        if (stare.next.length === 0) {
          const v = stare.values;
          emite({ tip: "gata", triaj: v.triaj, escaladat: v.escaladat, raspunsClient: v.raspunsClient, notaInterna: v.notaInterna, pasi: v.pasi });
        }
      } catch (e) {
        emite({ tip: "eroare", mesaj: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
