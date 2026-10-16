"use client";

import { useState } from "react";

type Option = string | { value: string; label: string };

const norm = (o: Option) => (typeof o === "string" ? { value: o, label: o } : o);

// Dropdown mit Mehrfachauswahl: gewählte Einträge erscheinen als Chips im Feld.
// locked: Werte, die angezeigt, aber nicht abgewählt werden können.
export function MultiSelect({
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
  const [open, setOpen] = useState(false);
  const opts = options.map(norm);
  const toggle = (v: string) => {
    if (value.includes(v)) {
      if (!locked.includes(v)) onChange(value.filter((x) => x !== v));
    } else onChange([...value, v]);
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((x) => !x)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={`flex min-h-[38px] w-full items-center justify-between gap-2 rounded-md border bg-surface px-3 py-1.5 text-left text-sm transition-colors disabled:opacity-60 ${
          error ? "border-danger bg-danger/5" : open ? "border-accent" : "border-line"
        }`}
      >
        <span className="flex flex-wrap gap-1.5">
          {value.length === 0 && <span className="text-muted/70">{placeholder}</span>}
          {opts
            .filter((o) => value.includes(o.value))
            .map((o) => (
              <span key={o.value} className="rounded bg-accent/15 px-2 py-0.5 text-xs font-medium text-text">
                {o.label}
              </span>
            ))}
        </span>
        <span aria-hidden className="text-xs text-muted">
          ▾
        </span>
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-multiselectable
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-xl"
          >
            {opts.map((o) => {
              const isLocked = locked.includes(o.value) && value.includes(o.value);
              return (
                <label
                  key={o.value}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-2 text-sm ${isLocked ? "opacity-60" : "cursor-pointer hover:bg-raised"}`}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={value.includes(o.value)}
                    disabled={isLocked}
                    onChange={() => toggle(o.value)}
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
