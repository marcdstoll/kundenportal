"use client";

import { useId, useRef, useState } from "react";

type Option = string | { value: string; label: string };

const norm = (o: Option) => (typeof o === "string" ? { value: o, label: o } : o);

// Personen-Auswahl als Eingabefeld (Cutter, Zuständige): gewählte Einträge stehen als Chips im Feld, weitere per „@Name“ eintippen
// (Pfeiltasten + Enter oder Klick). Rücktaste im leeren Feld entfernt den letzten Eintrag.
// locked: Werte, die angezeigt, aber nicht abgewählt werden können.
export function NameSelect({
  options,
  value,
  onChange,
  placeholder,
  error,
  disabled,
  label,
  locked = [],
}: {
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  error?: string;
  disabled?: boolean;
  label: string;
  locked?: string[];
}) {
  const opts = options.map(norm);
  const [query, setQuery] = useState("");
  const [browse, setBrowse] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const q = query.replace(/^@/, "").trim().toLowerCase();
  const starts = (l: string) => l.toLowerCase().startsWith(q);
  const hits = opts
    .filter((o) => !value.includes(o.value) && o.label.toLowerCase().includes(q))
    .sort((a, b) => Number(!starts(a.label)) - Number(!starts(b.label)));
  const open = focused && !disabled && (query.length > 0 || browse) && hits.length > 0;
  const idx = Math.min(active, hits.length - 1);
  const selected = value.map((v) => opts.find((o) => o.value === v) ?? { value: v, label: v });

  function add(v: string) {
    onChange([...value, v]);
    setQuery("");
    setBrowse(false);
    setActive(0);
    inputRef.current?.focus();
  }
  function remove(v: string) {
    if (!locked.includes(v)) onChange(value.filter((x) => x !== v));
  }

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex min-h-[38px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border bg-surface px-2 py-1.5 text-sm transition-colors ${
          disabled ? "opacity-60" : ""
        } ${error ? "border-danger bg-danger/5" : focused ? "border-accent" : "border-line"}`}
      >
        {selected.map((o) => (
          <span
            key={o.value}
            className="inline-flex items-center gap-1 rounded bg-accent/15 py-0.5 pl-2 pr-1 text-xs font-medium text-text"
          >
            {o.label}
            {!locked.includes(o.value) && !disabled && (
              <button
                type="button"
                aria-label={`${o.label} entfernen`}
                className="rounded px-1 text-muted hover:bg-raised hover:text-text"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(o.value);
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 placeholder:text-muted/70"
          style={{ outline: "none" }}
          placeholder={value.length === 0 ? placeholder : ""}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setBrowse(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) setBrowse(true);
              else setActive((idx + 1) % hits.length);
            } else if (e.key === "ArrowUp" && open) {
              e.preventDefault();
              setActive((idx - 1 + hits.length) % hits.length);
            } else if ((e.key === "Enter" || e.key === "Tab") && open) {
              e.preventDefault();
              add(hits[idx].value);
            } else if (e.key === "Enter" && query) {
              e.preventDefault();
            } else if (e.key === "Escape" && (open || query)) {
              e.preventDefault();
              e.stopPropagation();
              setQuery("");
              setBrowse(false);
            } else if (e.key === "Backspace" && !query && value.length) {
              const last = [...value].reverse().find((v) => !locked.includes(v));
              if (last) remove(last);
            }
          }}
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-xl"
        >
          {hits.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={i === idx}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === idx ? "bg-raised" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => add(o.value)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
