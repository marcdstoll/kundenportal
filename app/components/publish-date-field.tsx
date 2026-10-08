"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPublishDate } from "@/app/actions";
import { buttonSecondary, inputField } from "./ui";

// Veröffentlichungsdatum eintragen (für den Kalender)
export function PublishDateField({ jobId, value }: { jobId: string; value: string | null }) {
  const router = useRouter();
  const [date, setDate] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await setPublishDate(jobId, date);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          type="date"
          className={inputField}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setSaved(false);
          }}
          disabled={busy}
        />
        <button onClick={save} disabled={busy || date === (value ?? "")} className={buttonSecondary}>
          {saved ? "Gespeichert" : "Speichern"}
        </button>
      </div>
      {error && <p className="text-sm text-[var(--st-in_arbeit)]">{error}</p>}
    </div>
  );
}
