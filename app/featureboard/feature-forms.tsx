"use client";

// Featureboard – alles, was im Browser passiert: vorschlagen, voten, Status, Kommentare, Screenshots.

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addFeatureComment,
  createFeature,
  deleteFeature,
  deleteFeatureComment,
  deleteFeatureImage,
  editFeatureComment,
  markFeatureRead,
  setFeatureStatus,
  toggleVote,
} from "@/app/feature-actions";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { buttonPrimary, buttonSecondary, inputField } from "@/app/components/ui";
import { FEATURE_STATUSES, FEATURE_STATUS_COLORS, FEATURE_STATUS_LABELS } from "@/lib/features";
import { ScreenshotPicker, releaseShots, uploadScreenshots, type Shot } from "@/app/components/screenshots";
export { AddScreenshots } from "@/app/components/screenshots";

// ---------- Neuer Vorschlag ----------

export function NewFeatureForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className={buttonPrimary} onClick={() => setOpen(true)}>
        + Feature vorschlagen
      </button>
    );
  }

  const reset = () => {
    setTitle("");
    setDescription("");
    releaseShots(shots);
    setShots([]);
    setError(null);
    setOpen(false);
  };

  return (
    <form
      className="w-full space-y-3 rounded-xl border border-line bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return setError("Bitte die Idee in einem Satz beschreiben.");
        setBusy(true);
        setError(null);
        const res = await createFeature({ title, description });
        if (!res.ok) {
          setBusy(false);
          return setError(res.error);
        }
        try {
          if (shots.length > 0) await uploadScreenshots(`/api/features/${res.data.id}/images`, shots);
        } catch {
          // Vorschlag ist gespeichert – nur ein Bild hat nicht geklappt → Vorschlag öffnen, dort erneut hinzufügen
          setBusy(false);
          reset();
          router.push(`/featureboard?f=${res.data.id}&bild=fehler`, { scroll: false });
          return;
        }
        setBusy(false);
        reset();
        router.refresh();
      }}
    >
      <p className="font-medium">Neues Feature vorschlagen</p>
      <input
        className={inputField}
        placeholder="Was soll das Portal können? (ein Satz)"
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
        autoFocus
      />
      <textarea
        className={inputField}
        rows={4}
        placeholder="Beschreibung (optional) – wofür brauchst du es, wie stellst du es dir vor?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={busy}
      />
      <ScreenshotPicker
        shots={shots}
        disabled={busy}
        onChange={(next, err) => {
          setShots(next);
          setError(err);
        }}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonSecondary} onClick={reset} disabled={busy}>
          Abbrechen
        </button>
        <button className={buttonPrimary} disabled={busy}>
          {busy ? "Wird gespeichert …" : "Vorschlag einreichen"}
        </button>
      </div>
    </form>
  );
}

// ---------- Upvote ----------

export function VoteButton({
  featureId,
  count,
  voted,
  size = "sm",
}: {
  featureId: string;
  count: number;
  voted: boolean;
  size?: "sm" | "lg";
}) {
  const [state, setOptimistic] = useOptimistic({ count, voted });
  const [, startTransition] = useTransition();
  const big = size === "lg";
  return (
    <button
      type="button"
      aria-pressed={state.voted}
      aria-label={state.voted ? "Stimme zurücknehmen" : "Dafür stimmen"}
      title={state.voted ? "Stimme zurücknehmen" : "Dafür stimmen"}
      onClick={() =>
        startTransition(async () => {
          setOptimistic((s) => ({ voted: !s.voted, count: s.count + (s.voted ? -1 : 1) }));
          await toggleVote(featureId);
        })
      }
      className={`flex shrink-0 flex-col items-center justify-center rounded-lg border transition-colors ${
        big ? "h-14 w-16 gap-0.5" : "h-12 w-12"
      } ${
        state.voted
          ? "border-accent bg-accent/15 text-accent"
          : "border-line text-muted hover:border-accent/60 hover:text-text"
      }`}
    >
      <svg viewBox="0 0 12 8" className={big ? "h-2.5 w-3.5" : "h-2 w-3"} aria-hidden>
        <path d="M6 0 12 8H0z" fill="currentColor" />
      </svg>
      <span className={`font-semibold tabular-nums ${big ? "text-base" : "text-sm"}`} data-testid="vote-count">
        {state.count}
      </span>
    </button>
  );
}

// ---------- Status (nur Admins) ----------

export function FeatureStatusPicker({ featureId, status }: { featureId: string; status: string }) {
  const [value, setValue] = useState(status);
  const [busy, setBusy] = useState(false);
  const color = FEATURE_STATUS_COLORS[value];
  return (
    <select
      aria-label="Status"
      value={value}
      disabled={busy}
      className="rounded-md border px-2 py-1 text-xs font-medium"
      style={{ borderColor: color, color, background: `color-mix(in oklab, ${color} 12%, var(--surface))` }}
      onChange={async (e) => {
        const next = e.target.value;
        setValue(next);
        setBusy(true);
        const res = await setFeatureStatus(featureId, next);
        setBusy(false);
        if (!res.ok) setValue(status);
      }}
    >
      {FEATURE_STATUSES.map((s) => (
        <option key={s} value={s}>
          {FEATURE_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

// Beim Öffnen: zugehörige Inbox-Meldungen als gelesen markieren
export function MarkFeatureRead({ featureId }: { featureId: string }) {
  useEffect(() => {
    markFeatureRead(featureId);
  }, [featureId]);
  return null;
}

// ---------- Kommentare ----------

export function CommentForm({ featureId }: { featureId: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        setError(null);
        const res = await addFeatureComment(featureId, body);
        setBusy(false);
        if (!res.ok) return setError(res.error);
        setBody("");
      }}
    >
      <textarea
        className={inputField}
        rows={3}
        placeholder="Kommentar schreiben …"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={busy}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end">
        <button className={buttonPrimary} disabled={busy || !body.trim()}>
          Kommentieren
        </button>
      </div>
    </form>
  );
}

export type CommentView = {
  id: string;
  body: string;
  author: string;
  team: boolean;
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
};

export function FeatureComment({ c }: { c: CommentView }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  return (
    <li className="space-y-1.5 rounded-lg border border-line p-3" data-testid="feature-comment">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <span className={`font-medium ${c.team ? "text-accent" : "text-text"}`}>{c.author}</span>
        <span className="text-muted">
          {c.createdAt}
          {c.editedAt && (
            <span title={`Bearbeitet am ${c.editedAt}`} className="italic">
              {" "}
              · bearbeitet
            </span>
          )}
        </span>
      </div>

      {editing ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const res = await editFeatureComment(c.id, draft);
            setBusy(false);
            if (!res.ok) return setError(res.error);
            setEditing(false);
          }}
        >
          <textarea
            className={inputField}
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            autoFocus
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={buttonSecondary}
              disabled={busy}
              onClick={() => {
                setDraft(c.body);
                setEditing(false);
                setError(null);
              }}
            >
              Abbrechen
            </button>
            <button className={buttonPrimary} disabled={busy || !draft.trim()}>
              Speichern
            </button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{c.body}</p>
      )}

      {!editing && (c.canEdit || c.canDelete) && (
        <div className="flex gap-3 text-xs">
          {c.canEdit && (
            <button type="button" className="text-muted hover:text-text" onClick={() => setEditing(true)}>
              Bearbeiten
            </button>
          )}
          {c.canDelete && (
            <button type="button" className="text-muted hover:text-danger" onClick={() => setConfirm(true)}>
              Löschen
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title="Kommentar löschen?"
        message="Der Kommentar wird endgültig entfernt."
        confirmLabel="Löschen"
        busy={busy}
        error={error}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          const res = await deleteFeatureComment(c.id);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setConfirm(false);
        }}
      />
    </li>
  );
}

export function DeleteImageButton({ imageId }: { imageId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label="Screenshot entfernen"
      title="Screenshot entfernen"
      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-line bg-surface text-xs text-muted hover:text-danger"
      onClick={async () => {
        setBusy(true);
        await deleteFeatureImage(imageId);
        setBusy(false);
      }}
    >
      ×
    </button>
  );
}

// ---------- Vorschlag löschen ----------

export function DeleteFeatureButton({
  featureId,
  title,
  closeHref,
}: {
  featureId: string;
  title: string;
  closeHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="text-sm text-muted hover:text-danger" onClick={() => setOpen(true)}>
        Vorschlag löschen
      </button>
      <ConfirmDialog
        open={open}
        title="Vorschlag löschen?"
        message={<>„{title}“ wird mit allen Stimmen, Kommentaren und Screenshots endgültig gelöscht.</>}
        confirmLabel="Löschen"
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const res = await deleteFeature(featureId);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setOpen(false);
          router.push(closeHref, { scroll: false });
        }}
      />
    </>
  );
}
