"use client";

import { useRef, useState } from "react";
import { setPersonColor } from "@/app/profile-actions";
import { PALETTE, defaultColorHex } from "@/lib/colors";

// Farbwähler für die Personenfarbe: Vorschläge + freie Farbe + „Automatisch“
export function ColorPicker({ userId, name, color }: { userId: string; name: string; color: string | null }) {
  const [value, setValue] = useState<string | null>(color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auto = defaultColorHex(name);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(next: string | null) {
    const before = value;
    setValue(next);
    setBusy(true);
    setError(null);
    const res = await setPersonColor(userId, next);
    setBusy(false);
    if (!res.ok) {
      setValue(before);
      setError(res.error);
    }
  }

  const swatch = (c: string, label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      disabled={busy}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`size-7 rounded-full transition-transform hover:scale-110 ${
        active ? "ring-2 ring-text ring-offset-2 ring-offset-surface" : ""
      }`}
      style={{ background: c }}
    />
  );

  return (
    <div className="space-y-2" data-testid="color-picker">
      <div className="flex flex-wrap items-center gap-2">
        {PALETTE.map((c) => swatch(c, c, value === c, () => save(c)))}
        <label
          className={`relative inline-flex size-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-line text-xs text-muted hover:text-text ${
            value && !PALETTE.includes(value) ? "ring-2 ring-text ring-offset-2 ring-offset-surface" : ""
          }`}
          style={value && !PALETTE.includes(value) ? { background: value, borderStyle: "solid" } : undefined}
          title="Eigene Farbe"
        >
          {!(value && !PALETTE.includes(value)) && "+"}
          <input
            type="color"
            aria-label="Eigene Farbe"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={value ?? auto}
            disabled={busy}
            onChange={(e) => {
              // Beim Ziehen im Farbfeld nicht bei jedem Schritt speichern – erst, wenn kurz Ruhe ist
              const next = e.target.value;
              setValue(next);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => save(next), 600);
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full" style={{ background: value ?? auto }} />
          {value ? "Eigene Farbe" : "Automatische Farbe"}
        </span>
        {value && (
          <button type="button" className="hover:text-text hover:underline" disabled={busy} onClick={() => save(null)}>
            Zurück auf automatisch
          </button>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
