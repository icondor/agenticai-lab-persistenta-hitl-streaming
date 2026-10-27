// next.config.ts
//
// better-sqlite3 este un modul nativ (cod C compilat). Il lasam in afara
// bundle-ului Next, altfel build-ul incearca sa-l impacheteze si esueaza.

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@langchain/langgraph-checkpoint-sqlite"],
};

export default nextConfig;
