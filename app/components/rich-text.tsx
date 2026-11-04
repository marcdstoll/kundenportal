// Formatierter Text (siehe lib/rich-text.ts): fett, kursiv, durchgestrichen, Listen, Links und – in Kommentaren –
// @-Erwähnungen. Alles wird als echte Elemente aufgebaut, kein HTML aus dem Text.

import { Fragment } from "react";
import { EMPHASIS_RE, TRAILING, URL_RE, toBlocks } from "@/lib/rich-text";
import { splitMentions } from "@/lib/mentions";

function links(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0];
    let url = raw.replace(TRAILING, "");
    // Schließende Klammer gehört dazu, wenn der Link selbst eine öffnet (z. B. Wikipedia-Links)
    const opens = (url.match(/\(/g) ?? []).length;
    const closes = (url.match(/\)/g) ?? []).length;
    if (opens > closes && raw.slice(url.length).startsWith(")")) url += ")";
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <a
        key={`${key}-a${start}`}
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
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Hervorhebungen (verschachtelt möglich, z. B. **fett mit *kursiv***), darin Links
function emphasis(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(EMPHASIS_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(...links(text.slice(last, start), `${key}-t${last}`));
    const [, both, bold, strike, it1, it2] = m;
    const k = `${key}-e${start}`;
    if (both !== undefined)
      out.push(
        <strong key={k} className="font-semibold">
          <em>{emphasis(both, k)}</em>
        </strong>,
      );
    else if (bold !== undefined)
      out.push(
        <strong key={k} className="font-semibold">
          {emphasis(bold, k)}
        </strong>,
      );
    else if (strike !== undefined) out.push(<s key={k}>{emphasis(strike, k)}</s>);
    else out.push(<em key={k}>{emphasis((it1 ?? it2)!, k)}</em>);
    last = start + m[0].length;
  }
  if (last < text.length) out.push(...links(text.slice(last), `${key}-t${last}`));
  return out;
}

function inline(text: string, key: string, meId?: string): React.ReactNode[] {
  if (meId === undefined) return emphasis(text, key);
  return splitMentions(text).flatMap((part, i) =>
    part.mention ? (
      <span
        key={`${key}-m${i}`}
        className={`rounded px-0.5 font-medium text-accent ${part.mention.id === meId ? "bg-accent/15" : ""}`}
      >
        {part.text}
      </span>
    ) : (
      emphasis(part.text, `${key}-m${i}`)
    ),
  );
}

export function RichText({
  text,
  className = "",
  meId,
}: {
  text: string;
  className?: string;
  // gesetzt = Text enthält @-Erwähnungen (Kommentare); die eigene wird hervorgehoben
  meId?: string;
}) {
  return (
    <div className={`space-y-1.5 break-words ${className}`}>
      {toBlocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i} className="whitespace-pre-wrap">
            {inline(b.text, `b${i}`, meId)}
          </p>
        ) : (
          <Fragment key={i}>
            {b.kind === "ul" ? (
              <ul className="list-disc space-y-0.5 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>{inline(item, `b${i}-${j}`, meId)}</li>
                ))}
              </ul>
            ) : (
              <ol className="list-decimal space-y-0.5 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>{inline(item, `b${i}-${j}`, meId)}</li>
                ))}
              </ol>
            )}
          </Fragment>
        ),
      )}
    </div>
  );
}
