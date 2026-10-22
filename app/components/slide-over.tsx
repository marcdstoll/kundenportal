"use client";

import { useEffect } from "react";

// Panel, das von rechts hereingleitet (wie die Detailansichten) – die Seite dahinter bleibt unverändert.
// Escape oder Klick auf den abgedunkelten Hintergrund schließt (nicht während busy).
export function SlideOver({
  open,
  title,
  onClose,
  busy = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Schließen"
        className="absolute inset-0 cursor-default bg-black/45"
        onClick={() => !busy && onClose()}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="slide-in relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            aria-label="Schließen"
            disabled={busy}
            onClick={onClose}
            className="-mr-2 rounded-md px-2 py-1 text-xl leading-none text-muted hover:bg-raised hover:text-text disabled:opacity-40"
          >
            ×
          </button>
        </div>
        <div className="px-4 py-5 sm:px-6">{children}</div>
      </aside>
    </div>
  );
}
