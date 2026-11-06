"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runReviewShareBatch } from "@/app/review-share-actions";
import { buttonSecondary } from "@/app/components/ui";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Bestehende Review-Links durch Share-Links ersetzen – in Portionen (Frame.io: max. 10 Shares pro Minute)
export function ReviewShareButton({ missing }: { missing: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<{ done: number; failed: number; remaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setRunning(true);
    setError(null);
    let done = 0;
    let failed = 0;
    let first = true;
    try {
      for (;;) {
        const r = await runReviewShareBatch(first);
        first = false;
        done += r.done;
        failed += r.failed;
        setState({ done, failed, remaining: r.remaining });
        if (r.remaining === 0 || r.done + r.failed === 0) break;
        await wait(62_000);
      }
    } catch {
      setError("Abgebrochen – bitte erneut starten.");
    }
    setRunning(false);
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <button className={buttonSecondary} disabled={running || (missing === 0 && !state)} onClick={start}>
        {running ? "Share-Links werden erzeugt …" : `Share-Links erzeugen (${missing})`}
      </button>
      {state && (
        <p className="text-sm text-muted" role="status" data-testid="share-progress">
          {state.done} erledigt · {state.remaining} offen{state.failed > 0 && ` · ${state.failed} fehlgeschlagen`}
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
