// lib/afisare.ts
//
// Functii mici de afisare in consola, ca demo-urile sa ramana lizibile.
// Nu fac nimic didactic, doar formateaza. (Copiat din Lab 12, plus textulBucatii.)

type Mesaj = { content: unknown };

/** Textul unui mesaj, indiferent daca content e string sau lista de blocuri. */
export function textulMesajului(m: Mesaj): string {
  return textulBucatii(m.content).trim();
}

/**
 * Textul unei bucati de mesaj, FARA trim. In streaming, spatiile dintre
 * cuvinte vin uneori la inceputul sau la sfarsitul unei bucati; daca le-am
 * taia, cuvintele s-ar lipi intre ele.
 */
export function textulBucatii(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === "string" ? b : ((b as { type?: string; text?: string }).type === "text" ? ((b as { text?: string }).text ?? "") : "")))
      .join("");
  }
  return "";
}

/** Titlu de sectiune. */
export function titlu(text: string): void {
  console.log(`\n${"=".repeat(72)}\n${text}\n${"=".repeat(72)}`);
}

/** Diagrama Mermaid a unui graf, fara liniile de stil (classDef). Se poate lipi in mermaid.live. */
export function mermaidCurat(text: string): string {
  return text
    .split("\n")
    .filter((l) => !l.includes("classDef") && !l.startsWith("%%{"))
    .join("\n");
}
