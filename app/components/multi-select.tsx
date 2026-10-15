"use client";

import { useState } from "react";

// Dropdown mit Mehrfachauswahl: gewählte Einträge erscheinen als Chips im Feld
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  error,
  disabled,
  label,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  error?: string;
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);

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
          {options
            .filter((o) => value.includes(o))
            .map((o) => (
              <span key={o} className="rounded bg-accent/15 px-2 py-0.5 text-xs font-medium text-text">
                {o}
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
            className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-line bg-surface p-1.5 shadow-xl"
          >
            {options.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-raised">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={value.includes(o)}
                  onChange={() => toggle(o)}
                />
                {o}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
