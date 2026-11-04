"use client";

// Formatierungs-Leiste über einem Textfeld: B / I / S / Liste / nummerierte Liste (+ Strg/⌘+B, Strg/⌘+I).
// Einfach um das bestehende <textarea> legen:  <FormatField><textarea … /></FormatField>
// Setzt Markdown-Zeichen (siehe lib/rich-text.ts) um die Auswahl bzw. vor die markierten Zeilen;
// nochmal klicken entfernt sie wieder. Funktioniert mit kontrollierten React-Feldern (löst onChange aus).

import { useRef } from "react";

const setValue = (el: HTMLTextAreaElement, value: string, start: number, end: number) => {
  // Wert so setzen, dass React es als Eingabe mitbekommt
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.focus();
  el.setSelectionRange(start, end);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

function wrap(el: HTMLTextAreaElement, mark: string) {
  const { value, selectionStart: s, selectionEnd: e } = el;
  const n = mark.length;
  // Schon formatiert → Zeichen entfernen (innen oder direkt außen um die Auswahl)
  if (value.slice(s - n, s) === mark && value.slice(e, e + n) === mark) {
    return setValue(el, value.slice(0, s - n) + value.slice(s, e) + value.slice(e + n), s - n, e - n);
  }
  const sel = value.slice(s, e);
  if (sel.length > 2 * n && sel.startsWith(mark) && sel.endsWith(mark)) {
    return setValue(el, value.slice(0, s) + sel.slice(n, -n) + value.slice(e), s, e - 2 * n);
  }
  // Leerzeichen am Rand der Auswahl bleiben außerhalb (sonst greift die Formatierung nicht)
  const lead = sel.length - sel.trimStart().length;
  const trail = sel.length - sel.trimEnd().length;
  const a = s + lead;
  const b = e - trail;
  setValue(el, value.slice(0, a) + mark + value.slice(a, b) + mark + value.slice(b), a + n, b + n);
}

function list(el: HTMLTextAreaElement, numbered: boolean) {
  const { value, selectionStart: s, selectionEnd: e } = el;
  const from = value.lastIndexOf("\n", s - 1) + 1;
  const toIdx = value.indexOf("\n", e);
  const to = toIdx === -1 ? value.length : toIdx;
  const lines = value.slice(from, to).split("\n");
  const re = numbered ? /^\d{1,3}[.)]\s+/ : /^[-*•]\s+/;
  const all = lines.every((l) => re.test(l));
  const next = lines
    .map((l, i) => (all ? l.replace(re, "") : `${numbered ? `${i + 1}.` : "-"} ${l.replace(/^(\d{1,3}[.)]|[-*•])\s+/, "")}`))
    .join("\n");
  setValue(el, value.slice(0, from) + next + value.slice(to), from, from + next.length);
}

const BUTTONS = [
  { label: "B", title: "Fett (Strg/⌘+B)", cls: "font-bold", run: (el: HTMLTextAreaElement) => wrap(el, "**") },
  { label: "I", title: "Kursiv (Strg/⌘+I)", cls: "italic", run: (el: HTMLTextAreaElement) => wrap(el, "*") },
  { label: "S", title: "Durchgestrichen", cls: "line-through", run: (el: HTMLTextAreaElement) => wrap(el, "~~") },
  { label: "•", title: "Aufzählung", cls: "", run: (el: HTMLTextAreaElement) => list(el, false) },
  { label: "1.", title: "Nummerierte Liste", cls: "", run: (el: HTMLTextAreaElement) => list(el, true) },
];

export function FormatField({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const field = () => ref.current?.querySelector("textarea") ?? null;
  return (
    <div
      ref={ref}
      className={`space-y-1 ${className}`}
      onKeyDown={(e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || !(e.target instanceof HTMLTextAreaElement)) return;
        const key = e.key.toLowerCase();
        if (key !== "b" && key !== "i") return;
        e.preventDefault();
        wrap(e.target, key === "b" ? "**" : "*");
      }}
    >
      <div className="flex gap-0.5" role="toolbar" aria-label="Formatierung">
        {/* Bewusst kein <button>: Viele Textfelder stecken in einem <label>, und ein Label gehört immer zum
            ersten Knopf/Feld darin – die Überschrift soll aber weiter zum Textfeld gehören. */}
        {BUTTONS.map((b) => {
          const run = () => {
            const el = field();
            if (el && !el.disabled) b.run(el);
          };
          return (
            <span
              key={b.label}
              role="button"
              tabIndex={0}
              title={b.title}
              aria-label={b.title}
              // Fokus und Auswahl im Textfeld behalten
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault(); // Klick nicht ans umgebende <label> weitergeben
                run();
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                run();
              }}
              className={`flex h-6 min-w-6 cursor-pointer select-none items-center justify-center rounded px-1.5 text-xs text-muted transition-colors hover:bg-raised hover:text-text ${b.cls}`}
            >
              {b.label}
            </span>
          );
        })}
      </div>
      {children}
    </div>
  );
}
