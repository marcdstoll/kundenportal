"use client";

// Multifilter „Kunde × Format“ (Board und Kalender, Admins und Cutter): pro Kunde Shortform / Longform / Clipping.
// Bedienung: Punkt = ein Format eines Kunden · Kundenname = ganze Zeile · Spaltenkopf = Format bei allen ·
// „Alle Kunden“ = alles an/aus. Gespeichert wird beim Schließen (pro Nutzer und Ansicht, siehe lib/client-format-filter.ts).

import { useState, useTransition } from "react";
import { personColor } from "@/lib/colors";
import { FORMATS } from "@/lib/status";
import { saveViewFilter } from "@/app/filter-actions";
import { ALL_FORMATS, encodeMatrix, isUnfiltered, type FormatMatrix } from "@/lib/client-format-filter";
import { keepInViewport } from "@/lib/popover";
import { FORMAT_COLORS } from "./ui";

type Client = { id: string; name: string };
type View = "board" | "kalender";

const SHORT: Record<string, string> = { shortform: "Short", longform: "Long", clipping: "Clip" };

function save(view: View, matrix: FormatMatrix) {
  // k/f (alte Filter) leeren – ab jetzt gilt nur noch die Matrix
  return saveViewFilter(view, { m: encodeMatrix(matrix), k: "", f: "" });
}

function summary(clients: Client[], matrix: FormatMatrix) {
  if (isUnfiltered(matrix)) return "Alle Kunden & Formate";
  const visible = clients.filter((c) => (matrix[c.id] ?? ALL_FORMATS).length > 0);
  if (visible.length === 0) return "Nichts ausgewählt";
  const partial = visible.some((c) => (matrix[c.id] ?? ALL_FORMATS).length < ALL_FORMATS.length);
  if (visible.length === 1) return partial ? `${visible[0].name} · angepasst` : visible[0].name;
  const kunden = visible.length === clients.length ? "Alle Kunden" : `${visible.length} Kunden`;
  return partial ? `${kunden} · angepasst` : kunden;
}

export function ClientFormatFilter({ view, clients, matrix }: { view: View; clients: Client[]; matrix: FormatMatrix }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FormatMatrix>(matrix);
  const [pending, startTransition] = useTransition();
  const shown = open ? draft : matrix;
  const filtered = !isUnfiltered(matrix);

  const get = (id: string) => draft[id] ?? ALL_FORMATS;
  const setRow = (id: string, formats: string[]) => setDraft((d) => ({ ...d, [id]: ALL_FORMATS.filter((f) => formats.includes(f)) }));
  const toggleCell = (id: string, f: string) => {
    const cur = get(id);
    setRow(id, cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]);
  };
  const toggleRow = (id: string) => setRow(id, get(id).length === ALL_FORMATS.length ? [] : ALL_FORMATS);
  const columnOn = (f: string) => clients.every((c) => get(c.id).includes(f));
  const columnSome = (f: string) => clients.some((c) => get(c.id).includes(f));
  const toggleColumn = (f: string) => {
    const on = !columnOn(f);
    setDraft((d) =>
      Object.fromEntries(
        clients.map((c) => {
          const cur = d[c.id] ?? ALL_FORMATS;
          return [c.id, ALL_FORMATS.filter((x) => (x === f ? on : cur.includes(x)))];
        }),
      ),
    );
  };
  const allOn = isUnfiltered(Object.fromEntries(clients.map((c) => [c.id, get(c.id)])));
  const toggleAll = () =>
    setDraft(Object.fromEntries(clients.map((c) => [c.id, allOn ? [] : [...ALL_FORMATS]])));

  const openMenu = () => {
    setDraft(matrix);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    if (encodeMatrix(draft) !== encodeMatrix(matrix)) startTransition(() => save(view, draft));
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : openMenu())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm transition-colors hover:bg-raised ${
          filtered ? "border-accent text-text" : "border-line text-muted"
        } ${pending ? "opacity-60" : ""}`}
      >
        {summary(clients, shown)}
        <span aria-hidden className="text-xs">
          ▾
        </span>
      </button>

      {open && (
        <>
          <span className="fixed inset-0 z-10" onClick={close} />
          <div
            role="dialog"
            aria-label="Kunden und Formate filtern"
            ref={keepInViewport}
            onKeyDown={(e) => e.key === "Escape" && close()}
            className="absolute right-0 top-full z-20 mt-1 w-[22rem] rounded-lg border border-line bg-surface shadow-xl"
            data-testid="format-matrix"
          >
            <div className="max-h-[22rem] overflow-y-auto p-1.5">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-2 py-1.5 text-left font-normal">
                      <button
                        type="button"
                        onClick={toggleAll}
                        aria-pressed={allOn}
                        className="rounded px-1 font-medium hover:bg-raised"
                      >
                        Alle Kunden
                      </button>
                    </th>
                    {FORMATS.map((f) => (
                      <th key={f.value} className="w-14 px-1 py-1.5 text-center font-normal">
                        <button
                          type="button"
                          onClick={() => toggleColumn(f.value)}
                          aria-pressed={columnOn(f.value)}
                          title={`${f.label} bei allen Kunden ${columnOn(f.value) ? "ausblenden" : "anzeigen"}`}
                          className={`inline-flex items-center gap-1 rounded px-1 text-xs hover:bg-raised ${
                            columnOn(f.value) ? "text-text" : columnSome(f.value) ? "text-muted" : "text-muted/50"
                          }`}
                        >
                          <span className="size-2 rounded-[3px]" style={{ background: FORMAT_COLORS[f.value] }} />
                          {SHORT[f.value]}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const row = get(c.id);
                    return (
                      <tr key={c.id} className="border-t border-line/60" data-testid="matrix-row">
                        <td className="max-w-0 px-2 py-1">
                          <button
                            type="button"
                            onClick={() => toggleRow(c.id)}
                            className={`flex w-full items-center gap-2 truncate rounded px-1 py-0.5 text-left hover:bg-raised ${
                              row.length === 0 ? "text-muted/60" : ""
                            }`}
                            title={row.length === ALL_FORMATS.length ? "Kunde ausblenden" : "Kunde komplett anzeigen"}
                          >
                            <span className="size-2 shrink-0 rounded-full" style={{ background: personColor(c.id, c.name) }} />
                            <span className="truncate">{c.name}</span>
                          </button>
                        </td>
                        {FORMATS.map((f) => {
                          const on = row.includes(f.value);
                          const color = FORMAT_COLORS[f.value];
                          return (
                            <td key={f.value} className="px-1 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => toggleCell(c.id, f.value)}
                                aria-pressed={on}
                                aria-label={`${c.name}: ${f.label}`}
                                className="inline-flex size-6 items-center justify-center rounded-full border transition-colors"
                                style={
                                  on
                                    ? { borderColor: color, background: `color-mix(in oklab, ${color} 22%, transparent)` }
                                    : { borderColor: "var(--line)" }
                                }
                              >
                                {on && <span className="size-2.5 rounded-full" style={{ background: color }} />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {clients.length === 0 && <p className="px-2 py-1.5 text-sm text-muted">Noch keine Kunden.</p>}
            </div>
            <div className="flex items-center justify-between border-t border-line px-3 py-2">
              <button
                type="button"
                onClick={() => setDraft(Object.fromEntries(clients.map((c) => [c.id, [...ALL_FORMATS]])))}
                className="text-xs text-muted hover:text-text"
              >
                Zurücksetzen
              </button>
              <button type="button" onClick={close} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white">
                Fertig
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Aktiver Filter auf einen Blick: Kunden mit eingeschränkten Formaten als Chips (✕ = wieder komplett),
// ausgeblendete Kunden zusammengefasst
export function ClientFormatChips({ view, clients, matrix }: { view: View; clients: Client[]; matrix: FormatMatrix }) {
  const [pending, startTransition] = useTransition();
  if (isUnfiltered(matrix)) return null;
  const partial = clients.filter((c) => {
    const n = (matrix[c.id] ?? ALL_FORMATS).length;
    return n > 0 && n < ALL_FORMATS.length;
  });
  const hidden = clients.filter((c) => (matrix[c.id] ?? ALL_FORMATS).length === 0);
  const update = (change: FormatMatrix) => startTransition(() => save(view, { ...matrix, ...change }));
  const chip = "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs";
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${pending ? "opacity-60" : ""}`} aria-label="Aktiver Filter" data-testid="filter-chips">
      {partial.map((c) => (
        <span key={c.id} className={chip}>
          <span className="size-2 rounded-full" style={{ background: personColor(c.id, c.name) }} />
          {c.name}: {(matrix[c.id] ?? []).map((f) => SHORT[f]).join(", ")}
          <button
            type="button"
            onClick={() => update({ [c.id]: [...ALL_FORMATS] })}
            aria-label={`${c.name} wieder komplett anzeigen`}
            className="text-muted hover:text-text"
          >
            ✕
          </button>
        </span>
      ))}
      {hidden.length > 0 && (
        <span className={chip} title={hidden.map((c) => c.name).join(", ")}>
          {hidden.length === 1 ? `${hidden[0].name} ausgeblendet` : `${hidden.length} Kunden ausgeblendet`}
          <button
            type="button"
            onClick={() => update(Object.fromEntries(hidden.map((c) => [c.id, [...ALL_FORMATS]])))}
            aria-label="Ausgeblendete Kunden wieder anzeigen"
            className="text-muted hover:text-text"
          >
            ✕
          </button>
        </span>
      )}
      <button
        type="button"
        onClick={() => update(Object.fromEntries(clients.map((c) => [c.id, [...ALL_FORMATS]])))}
        className="px-1 text-xs text-muted hover:text-text"
      >
        Filter zurücksetzen
      </button>
    </div>
  );
}
