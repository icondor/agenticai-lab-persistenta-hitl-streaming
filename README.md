# Lab 13: persistence, human-in-the-loop, streaming

Triajul de tichete din Lab 12, cu trei lucruri noi:

- **persistence**: starea grafului se salveaza dupa fiecare super-step, intr-un fisier SQLite, si o citeste orice proces care stie `thread_id`-ul;
- **human-in-the-loop**: tichetul urgent opreste graful cu `interrupt()` pana cand un om aproba sau respinge escaladarea;
- **streaming**: pasii, progresul si textul ajung in consola si in browser pe masura ce graful ruleaza.

## Instalare

```bash
pnpm install
cp .env.example .env.local     # completeaza LLM_PROVIDER si cheia, ca in Lab 12
pnpm verifica                  # 36 de verificari, fara chei, fara cost
```

## Comenzi

| Comanda | Ce face | Model real? |
|---|---|---|
| `pnpm demo1` | Procesul A: ruleaza tichetul de facturare pe `tichet-102`, cu SqliteSaver | da |
| `pnpm demo2` | Procesul B: citeste acelasi thread (`getState`, checkpoint-urile pe super-step) | nu il cheama |
| `pnpm demo3` | Tichetul urgent se opreste la `aprobare_oncall` (`tichet-101`) | da |
| `pnpm demo4` | Alt proces: citeste cererea, intreaba aprob / resping, face resume cu `Command` | da |
| `pnpm demo5` | Acelasi triaj cu `graph.stream`: updates, messages, custom | da |
| `pnpm dev` | Pagina web: http://localhost:3000/triaj | da |
| `pnpm tema:schelet` | Tema: omul poate schimba prioritatea (vezi `exercitiu/Tema-Lab13.txt`) | da |
| `pnpm tema` | Rezolvarea temei | da |
| `pnpm verifica` | Verificari offline, cu modele false | nu |
| `pnpm tipuri` | `tsc --noEmit` | nu |
| `pnpm reset` | Sterge `date/` (toate thread-urile salvate) | nu |

Ordinea din sala: `demo1`, `demo2`, `demo3`, `demo4`, `demo5`, apoi pagina web.

## Structura

```
lib/
  llm.ts                 modelul, copiat din proiectul cursului
  env.ts                 incarca .env.local pentru demo-urile din consola
  afisare.ts             formatare in consola
  persistence.ts         SqliteSaver + configThread(threadId)
  triaj/
    schema.ts            schema de triaj (Lab 5, 12) + Decizie + CerereAprobare
    graf-triaj.ts        graful din Lab 12 + nodul aprobare_oncall (interrupt)
    evenimente.ts        din [mode, chunk] in evenimente pentru consola si SSE
demo/                    demo1-demo5
app/
  api/triaj/route.ts     POST: porneste tichetul SAU trimite decizia; raspuns SSE
  triaj/page.tsx         pagina: pasi, texte streamuite, butoane aprob / resping
exercitiu/               tema: schelet, rezolvare, enunt
verificare/test-lab13.ts verificarile offline
date/                    checkpoints.sqlite (se creeaza la prima rulare, e in .gitignore)
```

## Verificat prin rulare

- `pnpm verifica`: 36/36, pe versiunile fixate in `package.json` (LangGraph 1.5.0, checkpoint-sqlite 1.1.0, Next 16.3.6).
- `tsc --noEmit` si `next build` trec.
- Ruta web, cap-coada, cu un model fals: SSE, interrupt, resume, decizie invalida (400), resume pe un thread care nu asteapta (409), resume dupa **restart de server**.
- Pagina, intr-un browser real (Chromium): tichet, butonul de aprobare, pasii si textele.

## Nu e verificat aici

- Demo-urile si pagina **cu un model real**. Clasificarea variaza: tichetul urgent poate iesi uneori «medie», si atunci graful nu se opreste. Demo-urile spun asta in consola.
- PostgresSaver (doar pe slide).

## Capcane, toate verificate

| Capcana | Ce se intampla | Ce faci |
|---|---|---|
| `interrupt` fara checkpointer | eroare «No checkpointer set» | `compile({ checkpointer })` |
| checkpointer fara `thread_id` | eroare care numeste `thread_id` | `{ configurable: { thread_id } }` |
| cod inainte de `interrupt()` | ruleaza de doua ori: la pornire si la resume | efectele externe dupa `interrupt()` sau in alt nod |
| `messages` din `clasifica` | bucati de JSON (structured output) in interfata | filtrezi dupa `metadata.langgraph_node` |
| `Command` pus intr-o variabila | eroare TypeScript lunga, despre numele nodurilor | `new Command(...)` direct in apelul `stream` / `invoke` |
| importuri `./x.js` in Next 16 | `Module not found` (Turbopack) | importuri fara extensie |
