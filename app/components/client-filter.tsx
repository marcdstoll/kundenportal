"use client";

import { useOptimistic, useState, useTransition } from "react";
import { personColor } from "@/lib/colors";
import { saveViewFilter } from "@/app/filter-actions";
import type { FilterView } from "@/lib/view-filters";

// Dropdown mit Mehrfachauswahl: einen, mehrere oder alle Kunden anzeigen.
// Die Auswahl wird pro Nutzer und Ansicht gespeichert (Board, Kalender, Ideen jeweils eigene).
// Angezeigt wird immer die gespeicherte Auswahl – nur während des Speicherns die gerade angeklickte.
export function ClientFilter({
  view,
  clients,
  selected,
}: {
  view: FilterView;
  clients: { id: string; name: string }[];
  selected: string[];
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [picked, setPicked] = useOptimistic(selected);

  function apply(next: string[]) {
    const all = next.length === 0 || next.length === clients.length;
    startTransition(async () => {
      setPicked(all ? [] : next);
      await saveViewFilter(view, { k: all ? "" : next.join(",") });
    });
  }

  function toggle(id: string) {
    apply(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  }

  const label =
    picked.length === 0 || picked.length === clients.length
      ? "Alle Kunden"
      : picked.length === 1
        ? (clients.find((c) => c.id === picked[0])?.name ?? "1 Kunde")
        : `${picked.length} Kunden`;

  return (
    <div className="relative mr-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm transition-colors hover:bg-raised ${
          picked.length > 0 && picked.length < clients.length ? "border-accent text-text" : "border-line text-muted"
        }`}
      >
        {label}
        <span aria-hidden className="text-xs">
          ▾
        </span>
      </button>

      {open && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-multiselectable
            className="absolute right-0 top-full z-20 mt-1 max-h-80 w-60 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-xl"
          >
            <button
              type="button"
              onClick={() => apply([])}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-raised"
            >
              Alle Kunden
              {(picked.length === 0 || picked.length === clients.length) && (
                <span className="text-xs text-muted">✓</span>
              )}
            </button>
            <div className="my-1 border-t border-line" />
            {clients.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-raised"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={picked.includes(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span className="size-2 shrink-0 rounded-full" style={{ background: personColor(c.id, c.name) }} />
                <span className="truncate">{c.name}</span>
              </label>
            ))}
            {clients.length === 0 && <p className="px-2 py-1.5 text-sm text-muted">Noch keine Kunden.</p>}
          </div>
        </>
      )}
    </div>
  );
}
