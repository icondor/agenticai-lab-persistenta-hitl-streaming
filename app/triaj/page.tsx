"use client";

// app/triaj/page.tsx
//
// ===========================================================================
// PAGINA: triajul, live, cu aprobare din browser
// ===========================================================================
//
// Trei lucruri pe ecran, fiecare dintr-un stream mode:
//   Pasii         <- "updates"  (si "custom" pentru mesajele de progres)
//   Textele       <- "messages" (token cu token, separat pe nod)
//   Aprobarea     <- "updates" cu __interrupt__: apar butoanele Aprob / Resping
//
// Citirea SSE e aceeasi ca in Lab 1 si Lab 11: fetch, reader, impartim
// textul dupa "\n\n", fiecare bucata incepe cu "data: ".

import { useState } from "react";
import { TICHETE, type CerereAprobare, type Decizie } from "@/lib/triaj/schema";
import type { Eveniment } from "@/lib/triaj/evenimente";

type Linie = { tip: "pas" | "progres"; text: string };
type Final = Extract<Eveniment, { tip: "gata" }>;

export default function PaginaTriaj() {
  const [ticket, setTicket] = useState<string>(TICHETE.urgent.text);
  const [threadId, setThreadId] = useState<string>("");
  const [linii, setLinii] = useState<Linie[]>([]);
  const [raspuns, setRaspuns] = useState("");
  const [nota, setNota] = useState("");
  const [cerere, setCerere] = useState<CerereAprobare | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [ocupat, setOcupat] = useState(false);

  /** Trimite o cerere si citeste stream-ul SSE pana la capat. */
  async function trimite(corp: { threadId: string; ticket?: string; decizie?: Decizie }) {
    setOcupat(true);
    setEroare(null);
    setCerere(null);
    try {
      const res = await fetch("/api/triaj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corp),
      });
      if (!res.ok || !res.body) {
        setEroare(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let rest = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rest += decoder.decode(value, { stream: true });
        const bucati = rest.split("\n\n");
        rest = bucati.pop() ?? ""; // ultima bucata poate fi incompleta
        for (const b of bucati) {
          if (b.startsWith("data: ")) aplica(JSON.parse(b.slice(6)) as Eveniment);
        }
      }
    } catch (e) {
      setEroare(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupat(false);
    }
  }

  /** Un eveniment din stream schimba o singura parte din ecran. */
  function aplica(ev: Eveniment) {
    // detaliu vine din jurnalul pasi si incepe deja cu numele nodului
    if (ev.tip === "pas") setLinii((l) => [...l, { tip: "pas", text: ev.detaliu || ev.nod }]);
    if (ev.tip === "progres") setLinii((l) => [...l, { tip: "progres", text: ev.text }]);
    if (ev.tip === "token" && ev.nod === "raspuns_client") setRaspuns((t) => t + ev.text);
    if (ev.tip === "token" && ev.nod === "nota_interna") setNota((t) => t + ev.text);
    if (ev.tip === "aprobare") setCerere(ev.cerere);
    if (ev.tip === "gata") setFinal(ev);
    if (ev.tip === "eroare") setEroare(ev.mesaj);
  }

  function pornesteTichet() {
    // Fiecare tichet nou primeste un thread nou. Acelasi thread_id il folosim la decizie.
    const id = crypto.randomUUID();
    setThreadId(id);
    setLinii([]);
    setRaspuns("");
    setNota("");
    setFinal(null);
    void trimite({ threadId: id, ticket });
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-5 text-sm">
      <h1 className="text-2xl font-bold">Lab 13: triaj cu aprobare on-call</h1>

      <section className="space-y-2">
        <div className="flex gap-2">
          {Object.entries(TICHETE).map(([nume, t]) => (
            <button key={nume} onClick={() => setTicket(t.text)} className="rounded border px-3 py-1 hover:bg-gray-100" disabled={ocupat}>
              {nume}
            </button>
          ))}
        </div>
        <textarea value={ticket} onChange={(e) => setTicket(e.target.value)} rows={3} className="w-full rounded border p-2" />
        <button onClick={pornesteTichet} disabled={ocupat || ticket.trim().length < 3} className="rounded bg-black px-4 py-2 text-white disabled:opacity-40">
          {ocupat ? "Rulează..." : "Trimite tichetul"}
        </button>
        {threadId && <p className="text-gray-500">thread_id: {threadId}</p>}
      </section>

      {cerere && (
        <section className="rounded border-2 border-amber-500 bg-amber-50 p-4 space-y-2">
          <p className="font-semibold">{cerere.intrebare}</p>
          <p>
            {cerere.categorie}, prioritate <b>{cerere.prioritate}</b>: {cerere.rezumat}
          </p>
          <div className="flex gap-2">
            <button onClick={() => trimite({ threadId, decizie: "aprob" })} disabled={ocupat} className="rounded bg-red-600 px-4 py-2 text-white">
              Aprob escaladarea
            </button>
            <button onClick={() => trimite({ threadId, decizie: "resping" })} disabled={ocupat} className="rounded border px-4 py-2">
              Resping
            </button>
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="font-semibold">Pași (updates, custom)</h2>
          <ul className="mt-1 space-y-1">
            {linii.map((l, i) => (
              <li key={i} className={l.tip === "progres" ? "text-gray-500 italic" : ""}>
                {l.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <div>
            <h2 className="font-semibold">Răspuns către client (messages)</h2>
            <p className="min-h-16 whitespace-pre-wrap rounded border p-2">{raspuns}</p>
          </div>
          <div>
            <h2 className="font-semibold">Notă internă (messages)</h2>
            <p className="min-h-12 whitespace-pre-wrap rounded border p-2">{nota}</p>
          </div>
        </div>
      </section>

      {final && (
        <p className="rounded bg-green-50 p-2">
          Gata. Prioritate finală: <b>{final.triaj?.prioritate}</b>, escaladat: <b>{String(final.escaladat)}</b>.
        </p>
      )}
      {eroare && <p className="rounded bg-red-50 p-2 text-red-700">{eroare}</p>}
    </main>
  );
}
