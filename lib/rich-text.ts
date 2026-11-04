// Einfache Textformatierung (Markdown-Auswahl) – Regeln für Anzeige und Vorschauen:
//   **fett**   *kursiv* bzw. _kursiv_   ***fett + kursiv***   ~~durchgestrichen~~
//   Zeilen mit „- “ (oder „* “, „• “) = Aufzählung, „1. “ = nummerierte Liste
// Links werden weiterhin automatisch erkannt. Angezeigt wird über app/components/rich-text.tsx.

export const URL_RE = /\b(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/gi;
export const TRAILING = /[.,;:!?)\]}'"»“”]+$/;

// Hervorhebungen (Reihenfolge wichtig: *** vor ** vor *)
export const EMPHASIS_RE =
  /\*\*\*(?=\S)([^\n]+?)(?<=\S)\*\*\*|\*\*(?=\S)([^\n]+?)(?<=\S)\*\*|~~(?=\S)([^\n]+?)(?<=\S)~~|(?<![\w*])\*(?=[^\s*])([^*\n]+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=[^\s_])([^_\n]+?)(?<=\S)_(?![\w_])/g;

export const BULLET_RE = /^\s*[-*•]\s+/;
export const NUMBER_RE = /^\s*\d{1,3}[.)]\s+/;

export type Block = { kind: "p"; text: string } | { kind: "ul" | "ol"; items: string[] };

// Text in Absätze und Listen zerlegen (Zeilenumbrüche in Absätzen bleiben erhalten)
export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const kind = BULLET_RE.test(line) ? "ul" : NUMBER_RE.test(line) ? "ol" : "p";
    const last = blocks[blocks.length - 1];
    if (kind === "p") {
      if (last?.kind === "p") last.text += `\n${line}`;
      else blocks.push({ kind: "p", text: line });
    } else {
      const item = line.replace(kind === "ul" ? BULLET_RE : NUMBER_RE, "");
      if (last?.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    }
  }
  // Leere Zeilen am Rand eines Absatzes nicht als Abstand anzeigen
  return blocks
    .map((b) => (b.kind === "p" ? { ...b, text: b.text.replace(/^\n+|\n+$/g, "") } : b))
    .filter((b) => b.kind !== "p" || b.text.trim() !== "");
}

// Für Glocke, E-Mails, Vorschauen: Formatierungszeichen entfernen
export function stripMarkdown(text: string) {
  return text
    .replace(EMPHASIS_RE, (_m, a, b, c, d, e) => a ?? b ?? c ?? d ?? e ?? "")
    .replace(/^\s*[-*•]\s+/gm, "• ")
    .replace(/^\s*(\d{1,3})[.)]\s+/gm, "$1. ");
}
