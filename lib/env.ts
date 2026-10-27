// lib/env.ts
//
// Incarca variabilele de mediu din .env.local (ca in Lab 11 si Lab 12), apoi
// din .env. dotenv NU suprascrie ce e deja setat. Se importa PRIMUL in fiecare
// demo din consola: import "../lib/env";
// Pagina web nu are nevoie de el: Next.js citeste singur .env.local.

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
