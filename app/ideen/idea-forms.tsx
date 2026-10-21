"use client";

import { useState } from "react";
import { createIdea, deleteIdea, setIdeaDone } from "@/app/idea-actions";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { buttonPrimary, buttonSecondary, inputField } from "@/app/components/ui";

// Neue Idee anlegen (nur Kunden): Titel + Notiz
export function NewIdeaForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className={buttonPrimary} onClick={() => setOpen(true)}>
        + Neue Idee
      </button>
    );
  }
  return (
    <form
      className="w-full max-w-xl space-y-3 rounded-xl border border-line bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return setError("Bitte einen Titel eingeben.");
        setBusy(true);
        setError(null);
        const res = await createIdea({ title, note });
        setBusy(false);
        if (!res.ok) return setError(res.error);
        setTitle("");
        setNote("");
        setOpen(false);
      }}
    >
      <p className="font-medium">Neue Projekt-Idee</p>
      <input
        className={inputField}
        placeholder="Titel"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
        autoFocus
      />
      <textarea
        className={inputField}
        rows={4}
        placeholder="Notiz – worum geht es, was ist wichtig?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonSecondary} onClick={() => setOpen(false)} disabled={busy}>
          Abbrechen
        </button>
        <button className={buttonPrimary} disabled={busy}>
          Idee speichern
        </button>
      </div>
    </form>
  );
}

// Abhaken bzw. wieder öffnen
export function IdeaCheck({ id, done, title }: { id: string; done: boolean; title: string }) {
  const [checked, setChecked] = useState(done);
  const [busy, setBusy] = useState(false);
  return (
    <input
      type="checkbox"
      className="size-4 cursor-pointer accent-[var(--accent)]"
      checked={checked}
      disabled={busy}
      aria-label={done ? `„${title}“ wieder öffnen` : `„${title}“ abhaken`}
      title={done ? "Wieder öffnen" : "Abhaken"}
      onChange={async (e) => {
        const next = e.target.checked;
        setChecked(next);
        setBusy(true);
        const res = await setIdeaDone(id, next);
        setBusy(false);
        if (!res.ok) setChecked(!next);
      }}
    />
  );
}

export function DeleteIdeaButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label={`„${title}“ löschen`}
        title="Löschen"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="rounded px-1.5 text-muted hover:bg-danger/10 hover:text-danger"
      >
        ✕
      </button>
      <ConfirmDialog
        open={open}
        title="Idee löschen?"
        message={
          <>
            „<b className="text-text">{title}</b>“ wird endgültig gelöscht.
          </>
        }
        confirmLabel="Löschen"
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const res = await deleteIdea(id);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setOpen(false);
        }}
      />
    </>
  );
}
