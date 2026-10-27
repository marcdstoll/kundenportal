"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary, buttonSecondary, inputField } from "./ui";

type Save = (input: { title: string; description: string }) => Promise<{ ok: boolean; error?: string }>;

// Titel + Beschreibung nachträglich bearbeiten (Projekt-Ideen, Featureboard).
// children = die normale Anzeige der Beschreibung; „Bearbeiten“ blendet stattdessen das Formular ein.
export function EditDetails({
  title,
  description,
  save,
  children,
}: {
  title: string;
  description: string;
  save: Save;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [t, setT] = useState(title);
  const [d, setD] = useState(description);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="space-y-2">
        {children}
        <button
          type="button"
          className="text-xs text-accent hover:underline"
          onClick={() => {
            setT(title);
            setD(description);
            setError(null);
            setEditing(true);
          }}
        >
          Titel und Beschreibung bearbeiten
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-line p-3"
      aria-label="Bearbeiten"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const res = await save({ title: t, description: d });
          if (!res.ok) return setError(res.error ?? "Speichern fehlgeschlagen.");
          setEditing(false);
          router.refresh();
        });
      }}
    >
      <label className="block space-y-1">
        <span className="text-xs text-muted">Titel</span>
        <input
          className={inputField}
          value={t}
          onChange={(e) => setT(e.target.value)}
          maxLength={200}
          disabled={pending}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Beschreibung</span>
        <textarea
          className={`${inputField} min-h-32`}
          value={d}
          onChange={(e) => setD(e.target.value)}
          maxLength={5000}
          disabled={pending}
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className={buttonPrimary} disabled={pending || !t.trim()}>
          {pending ? "Speichert …" : "Speichern"}
        </button>
        <button type="button" className={buttonSecondary} disabled={pending} onClick={() => setEditing(false)}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
