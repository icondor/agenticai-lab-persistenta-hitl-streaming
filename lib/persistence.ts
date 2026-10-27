// lib/persistence.ts
//
// ===========================================================================
// UNDE SE PASTREAZA CHECKPOINT-URILE
// ===========================================================================
//
// MemorySaver (Lab 9): checkpoint-urile stau in RAM. Mor odata cu procesul.
// SqliteSaver (azi):   checkpoint-urile stau intr-un fisier SQLite. Un alt
//                      proces (alt demo, serverul Next.js, maine dimineata)
//                      le gaseste dupa thread_id.
//
// ELEMENT NOU
//   SqliteSaver
//   Din ce pachet:  @langchain/langgraph-checkpoint-sqlite
//   Ce e:           un checkpointer care scrie in SQLite (prin better-sqlite3).
//   La ce e bun:    persistence reala pe o singura masina: demo-uri, aplicatii
//                   mici. In productie, cu mai multe servere: PostgresSaver.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

export const FISIER_CHECKPOINTS = process.env.CHECKPOINT_DB ?? "date/checkpoints.sqlite";

/** Un SqliteSaver peste fisierul proiectului. Creeaza folderul daca lipseste. */
export function creeazaCheckpointer(fisier: string = FISIER_CHECKPOINTS): SqliteSaver {
  mkdirSync(dirname(fisier), { recursive: true });
  return SqliteSaver.fromConnString(fisier);
}

/** Config-ul unui thread. Acelasi thread_id = aceeasi conversatie, acelasi tichet. */
export function configThread(threadId: string) {
  return { configurable: { thread_id: threadId } };
}
