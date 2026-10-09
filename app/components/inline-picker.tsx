"use client";

import { useState } from "react";
import { setFormat, setStatus } from "@/app/actions";
import { FORMATS, STATUSES } from "@/lib/status";
import { FormatTag, StatusBadge } from "./ui";

// Status oder Format direkt anklicken und neu wählen – wie in Notion (nur Admins)
export function InlinePicker({ jobId, kind, value }: { jobId: string; kind: "status" | "format"; value: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: string[] = kind === "status" ? [...STATUSES] : FORMATS.map((f) => f.value);
  const show = (v: string) => (kind === "status" ? <StatusBadge status={v} /> : <FormatTag format={v} />);

  async function choose(next: string) {
    setOpen(false);
    if (next === current) return;
    const previous = current;
    setCurrent(next); // sofort anzeigen, Server bestätigt danach
    setBusy(true);
    setError(null);
    const res = kind === "status" ? await setStatus(jobId, next) : await setFormat(jobId, next);
    setBusy(false);
    if (!res.ok) {
      setCurrent(previous);
      setError(res.error);
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        title={kind === "status" ? "Status ändern" : "Format ändern"}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`rounded-md px-1 py-0.5 ring-line transition hover:bg-raised hover:ring-1 ${busy ? "opacity-60" : ""}`}
      >
        {show(current)}
      </button>

      {open && (
        <>
          {/* Klick daneben schließt */}
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul role="listbox" className="absolute left-0 top-full z-20 mt-1 min-w-48 space-y-0.5 rounded-lg border border-line bg-surface p-1.5 shadow-xl">
            {options.map((o) => (
              <li key={o}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o === current}
                  onClick={() => choose(o)}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-raised ${o === current ? "bg-raised/60" : ""}`}
                >
                  {show(o)}
                  {o === current && <span className="text-xs text-muted">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <span className="absolute left-0 top-full mt-1 whitespace-nowrap text-xs text-danger">{error}</span>}
    </span>
  );
}
