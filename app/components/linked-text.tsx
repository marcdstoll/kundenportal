// Text mit erkannten Links (http(s)://… oder www.…) – z. B. für Beschreibungen von Ideen und Vorschlägen.
// Zeilenumbrüche bleiben erhalten; Satzzeichen am Ende gehören nicht zum Link.
const URL_RE = /\b(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/gi;
const TRAILING = /[.,;:!?)\]}'"»“”]+$/;

export function LinkedText({ text, className = "" }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0];
    let url = raw.replace(TRAILING, "");
    // Schließende Klammer gehört dazu, wenn der Link selbst eine öffnet (z. B. Wikipedia-Links)
    const opens = (url.match(/\(/g) ?? []).length;
    const closes = (url.match(/\)/g) ?? []).length;
    if (opens > closes && raw.slice(url.length).startsWith(")")) url += ")";
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a
        key={start}
        href={url.startsWith("www.") ? `https://${url}` : url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="break-all text-accent underline-offset-2 hover:underline"
      >
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <p className={`whitespace-pre-wrap ${className}`}>{parts}</p>;
}
