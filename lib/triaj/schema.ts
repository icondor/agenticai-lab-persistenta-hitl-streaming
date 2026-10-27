// lib/triaj/schema.ts
//
// ===========================================================================
// TRIAJ DE TICHETE: aceeasi schema ca in Lab 5 si Lab 12
// ===========================================================================
//
// Nou in Lab 13: Decizie (ce raspunde omul la aprobare) si CerereAprobare
// (ce ii aratam omului cand graful se opreste).

import { z } from "zod";

export const schemaTriaj = z.object({
  categorie: z.enum(["bug", "functionalitate", "intrebare", "facturare"]).describe("Tipul tichetului"),
  prioritate: z.enum(["urgenta", "medie", "joasa"]).describe("Cat de repede trebuie tratat"),
  rezumat: z.string().describe("Rezumatul problemei in maxim o propozitie"),
});
export type Triaj = z.infer<typeof schemaTriaj>;

/** Ce poate raspunde omul de on-call. Orice altceva e respins cu eroare. */
export const Decizie = z.enum(["aprob", "resping"]);
export type Decizie = z.infer<typeof Decizie>;

/** Ce ii aratam omului in momentul interrupt: exact cat ii trebuie ca sa decida. */
export type CerereAprobare = {
  intrebare: string;
  ticket: string;
  categorie: Triaj["categorie"];
  prioritate: Triaj["prioritate"];
  rezumat: string;
};

/** Trei tichete de test, cate unul pe fiecare ramura. */
export const TICHETE = {
  urgent: {
    clientId: "acme",
    text: "Platforma nu mai porneste de azi-dimineata, toti cei 40 de utilizatori ai nostri sunt blocati. Platim abonamentul Enterprise.",
  },
  facturare: {
    clientId: "beta-srl",
    text: "Am primit factura pe octombrie de doua ori. Puteti verifica, va rog? Nu e grabnic.",
  },
  idee: {
    clientId: "gamma",
    text: "Ar fi util un export in Excel pentru rapoarte. Multumesc!",
  },
} as const;
