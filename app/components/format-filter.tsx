import { FORMATS } from "@/lib/status";
import { FORMAT_COLORS } from "./ui";
import { FilterButton } from "./filter-button";

// Filter-Chips für Shortform / Longform / Clipping – einzeln oder kombiniert.
// Klick schaltet ein Format an/aus; mindestens eines bleibt immer aktiv. Gespeichert pro Nutzer (Board).
export function FormatFilter({ active }: { active: string[] }) {
  const all = FORMATS.map((f) => f.value as string);

  function nextFor(value: string) {
    const isOn = active.includes(value);
    // Ohne Filter: Klick zeigt nur dieses Format. Mit Filter: Format dazu- bzw. wegschalten.
    let next = active.length === all.length ? [value] : isOn ? active.filter((f) => f !== value) : [...active, value];
    if (next.length === 0) next = all; // nichts gewählt = alles anzeigen
    const keep = all.filter((f) => next.includes(f));
    return keep.length === all.length ? "" : keep.join(",");
  }

  const allOn = active.length === all.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Format filtern">
      {FORMATS.map((f) => {
        const on = active.includes(f.value) && !allOn;
        const color = FORMAT_COLORS[f.value];
        return (
          <FilterButton
            key={f.value}
            view="board"
            patch={{ f: nextFor(f.value) }}
            aria-pressed={active.includes(f.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
              on
                ? "text-text"
                : allOn
                  ? "border-line text-muted hover:text-text"
                  : "border-line text-muted/60 hover:text-text"
            }`}
            style={
              on ? { borderColor: color, background: `color-mix(in oklab, ${color} 14%, transparent)` } : undefined
            }
          >
            <span className="size-2 rounded-[3px]" style={{ background: color, opacity: allOn || on ? 1 : 0.4 }} />
            {f.label}
          </FilterButton>
        );
      })}
      {!allOn && (
        <FilterButton view="board" patch={{ f: "" }} className="px-2 text-xs text-muted hover:text-text">
          Alle
        </FilterButton>
      )}
    </div>
  );
}
