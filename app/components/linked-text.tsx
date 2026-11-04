import { RichText } from "./rich-text";

// Text mit erkannten Links und Formatierung (fett, kursiv, Listen … – siehe lib/rich-text.ts)
export function LinkedText({ text, className = "" }: { text: string; className?: string }) {
  return <RichText text={text} className={className} />;
}
