"use client";

import { useOptimistic, useState, useTransition } from "react";
import { runViewSyncNow, setHallOfFameForCutters } from "@/app/hall-of-fame-actions";
import type { SyncResult } from "@/lib/view-sync";
import { buttonSecondary } from "@/app/components/ui";
import { runSummary } from "@/lib/sync-summary";

// Views-Abruf von Hand starten – gleiches Vorgehen wie der nächtliche Lauf
export function ViewSyncButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);
  return (
    <div className="space-y-2">
      <button
        className={buttonSecondary}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await runViewSyncNow());
          })
        }
      >
        {pending ? "Views werden abgerufen …" : "Views jetzt abrufen"}
      </button>
      {result && (
        <p className={`text-sm ${result.error ? "text-danger" : "text-[var(--st-online)]"}`} role="status">
          {result.error ? `⚠ ${result.error}` : `✓ ${runSummary(result)}`}
        </p>
      )}
    </div>
  );
}

// Hall of Fame für Cutter freigeben (zum Start nur Admins)
export function CutterVisibilityToggle({ on }: { on: boolean }) {
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useOptimistic(on);
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-[var(--accent)]"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(async () => {
            setChecked(next);
            await setHallOfFameForCutters(next);
          });
        }}
      />
      Für Cutter sichtbar (sie sehen nur ihre freigegebenen Clients)
    </label>
  );
}
