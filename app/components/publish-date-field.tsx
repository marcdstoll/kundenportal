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
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

// Kompakt in der Kopfzeile des Panels: Datum direkt ändern, gespeichert wird beim Verlassen des Feldes bzw. mit Enter
export function InlinePublishDate({ jobId, value }: { jobId: string; value: string | null }) {
  const router = useRouter();
  const [date, setDate] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (date === (value ?? "") || busy) return;
    setBusy(true);
    setError(null);
    const res = await setPublishDate(jobId, date);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setDate(value ?? "");
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col">
      <input
        type="date"
        aria-label="Veröffentlichung"
        className={`-mx-1 -my-0.5 w-fit rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-line focus:border-line focus:outline-none ${date ? "" : "text-muted"} ${busy ? "opacity-50" : ""}`}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        disabled={busy}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
