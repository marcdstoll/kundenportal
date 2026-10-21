"use client";

// Textfeld mit @-Erwähnungen: Nach „@“ erscheint eine Auswahl (Suche nach Name oder E-Mail).
// Im Feld steht danach nur „@Name“ – welche Person gemeint ist, merkt sich die Komponente (mentions).

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { splitMentions, type MentionPerson } from "@/lib/mentions";
import { Avatar, inputField } from "./ui";

const MAX_HITS = 6;

// Text vor dem Cursor: steht dort „@suche“? Gesucht wird ab dem letzten „@“ am Wortanfang,
// damit auch E-Mail-Adressen („@anna@firma.de“) und Namen mit Leerzeichen („@Mario Le“) funktionieren.
function activeQuery(text: string, caret: number) {
  const before = text.slice(0, caret);
  for (let i = before.lastIndexOf("@"); i >= 0 && caret - i <= 41; i = before.lastIndexOf("@", i - 1)) {
    const query = before.slice(i + 1);
    if (query.includes("\n")) return null;
    if (i === 0 || /\s/.test(before[i - 1])) return { start: i, query };
  }
  return null;
}

function matches(people: MentionPerson[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return people.slice(0, MAX_HITS);
  return people
    .filter((p) => p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
    .slice(0, MAX_HITS);
}

// p.role ist hier schon die Anzeige-Bezeichnung (z. B. „Cutter“, „Team“)
export type MentionInputHandle = { focus: () => void };

export const MentionInput = forwardRef<
  MentionInputHandle,
  {
    value: string;
    mentions: MentionPerson[];
    onChange: (value: string, mentions: MentionPerson[]) => void;
    people: MentionPerson[];
    showEmail?: boolean; // E-Mail-Adressen in der Auswahl zeigen (nur für Team/Cutter)
    rows?: number;
    placeholder?: string;
    disabled?: boolean;
    autoFocus?: boolean;
  }
>(function MentionInput(
  { value, mentions, onChange, people, showEmail = false, rows = 2, placeholder, disabled, autoFocus },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }), []);

  const hits = query ? matches(people, query.query) : [];
  const open = !!query && hits.length > 0;

  function update(text: string, caret: number) {
    // Erwähnungen, deren „@Name“ gelöscht wurde, vergessen
    const kept = mentions.filter((m) => text.includes(`@${m.name}`));
    onChange(text, kept);
    setQuery(activeQuery(text, caret));
    setActive(0);
  }

  function pick(p: MentionPerson) {
    if (!query) return;
    const caret = area.current?.selectionStart ?? value.length;
    const insert = `@${p.name} `;
    const text = value.slice(0, query.start) + insert + value.slice(caret);
    const next = mentions.some((m) => m.id === p.id) ? mentions : [...mentions, { id: p.id, name: p.name }];
    onChange(text, next);
    setQuery(null);
    const pos = query.start + insert.length;
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={area}
        rows={rows}
        className={inputField}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-autocomplete="list"
        onChange={(e) => update(e.target.value, e.target.selectionStart)}
        onClick={(e) => setQuery(activeQuery(value, e.currentTarget.selectionStart))}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % hits.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + hits.length) % hits.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(hits[active]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setQuery(null);
          }
        }}
      />
      {open && (
        <ul
          role="listbox"
          aria-label="Person erwähnen"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-xl"
        >
          {hits.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === active ? "bg-raised" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(p)}
              >
                <Avatar name={p.name} id={p.id} />
                <span className="min-w-0 flex-1 truncate">
                  {p.name}
                  {showEmail && p.email && <span className="ml-2 text-xs text-muted">{p.email}</span>}
                </span>
                {p.role && <span className="shrink-0 text-xs text-muted">{p.role}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

// Kommentartext mit hervorgehobenen Erwähnungen (die eigene etwas kräftiger)
export function MentionText({ body, meId }: { body: string; meId: string }) {
  return (
    <>
      {splitMentions(body).map((part, i) =>
        part.mention ? (
          <span
            key={i}
            className={`rounded px-0.5 font-medium text-accent ${part.mention.id === meId ? "bg-accent/15" : ""}`}
          >
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
