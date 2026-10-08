"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveJob,
  claimJob,
  finishJob,
  returnJob,
  startJob,
  type Result,
} from "@/app/actions";
import { uploadFile } from "@/lib/upload";

type Props = {
  jobId: string;
  status: string;
  isMine: boolean;
  isAdmin: boolean;
};

// Knöpfe auf einer Board-Karte, abhängig von Status und Rolle
export function JobActions({ jobId, status, isMine, isAdmin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState("");

  async function run(action: () => Promise<Result>) {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (!res.ok) setError(res.error);
    router.refresh();
  }

  async function uploadFinal(file: File) {
    setBusy(true);
    setError(null);
    try {
      await uploadFile(jobId, "fertig", file, setProgress);
      // Nach dem Upload springt der Auftrag automatisch auf "Feedback"
      const res = await finishJob(jobId);
      if (!res.ok) throw new Error(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    }
    setBusy(false);
    setProgress(null);
    router.refresh();
  }

  const button = "w-full rounded px-3 py-1.5 text-white disabled:opacity-50";

  return (
    <div className="space-y-2">
      {status === "todo" && (
        <button disabled={busy} onClick={() => run(() => claimJob(jobId))} className={`${button} bg-blue-600`}>
          Übernehmen
        </button>
      )}

      {status === "warteschlange" && isMine && (
        <button disabled={busy} onClick={() => run(() => startJob(jobId))} className={`${button} bg-blue-600`}>
          Bearbeitung starten
        </button>
      )}

      {status === "in_bearbeitung" && isMine && (
        <label className="block space-y-1">
          <span className="block font-medium">Fertiges Video hochladen</span>
          <input
            type="file"
            accept="video/*"
            disabled={busy}
            className="block w-full text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFinal(file);
            }}
          />
          {progress !== null && (
            <div className="h-2 rounded bg-gray-300/30">
              <div className="h-2 rounded bg-blue-600" style={{ width: `${progress}%` }} />
            </div>
          )}
        </label>
      )}

      {status === "feedback" && isAdmin && (
        <div className="space-y-2">
          <button disabled={busy} onClick={() => run(() => approveJob(jobId))} className={`${button} bg-green-600`}>
            Freigeben
          </button>
          <textarea
            className="w-full rounded border bg-transparent px-2 py-1"
            rows={2}
            placeholder="Hinweis für den Cutter"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
          <button
            disabled={busy}
            onClick={() => run(() => returnJob(jobId, note))}
            className={`${button} bg-orange-600`}
          >
            Zurückgeben
          </button>
        </div>
      )}

      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
