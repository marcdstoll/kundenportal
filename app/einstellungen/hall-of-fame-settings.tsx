"use client";

import { useState, useTransition } from "react";
import { runViewSyncNow } from "@/app/hall-of-fame-actions";
import { buttonSecondary, formatDateTime } from "@/app/components/ui";

// Views-Abruf von Hand starten – gleiches Vorgehen wie der nächtliche Lauf; danach kurze Rückmeldung mit Zeitpunkt
export function ViewSyncButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <button
        className={buttonSecondary}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMsg(null);
            const r = await runViewSyncNow();
            setMsg(
              r.error
                ? { ok: false, text: r.error }
                : { ok: true, text: `Views abgerufen ✓ (${formatDateTime(r.finishedAt)})` },
            );
          })
        }
      >
        {pending ? "Views werden abgerufen …" : "Views jetzt abrufen"}
      </button>
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-[var(--st-online)]" : "text-danger"}`} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
