// app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lab 13: persistence, HITL, streaming",
  description: "Triajul de tichete cu aprobare on-call, live în browser",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
