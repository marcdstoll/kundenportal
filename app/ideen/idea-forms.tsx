"use client";

// Projekt-Ideen – alles, was im Browser passiert: anlegen, voten, Status/Priorität, Kommentare, Screenshots.

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addIdeaComment,
  createIdea,
  deleteIdea,
  deleteIdeaComment,
  deleteIdeaImage,
  editIdeaComment,
  markIdeaRead,
  setIdeaPriority,
  setIdeaStatus,
  toggleIdeaVote,
} from "@/app/idea-actions";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { ScreenshotPicker, releaseShots, uploadScreenshots, type Shot } from "@/app/components/screenshots";
import { buttonPrimary, buttonSecondary, inputField } from "@/app/components/ui";
import {
  IDEA_STATUSES,
  IDEA_STATUS_COLORS,
  IDEA_STATUS_LABELS,
  PRIORITIES,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
} from "@/lib/ideas";

// ---------- Neue Idee ----------

export function NewIdeaForm({ clients }: { clients: { id: string; name: string }[] | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("mittel");
  const [customerId, setCustomerId] = useState(clients?.length === 1 ? clients[0].id : "");
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className={buttonPrimary} onClick={() => setOpen(true)}>
        + Neue Idee
      </button>
    );
  }

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("mittel");
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
        if (!title.trim()) return setError("Bitte einen Titel eingeben.");
        if (clients && !customerId) return setError("Bitte einen Kunden auswählen.");
        setBusy(true);
        setError(null);
        const res = await createIdea({ title, description, priority, customerId: customerId || undefined });
        if (!res.ok) {
          setBusy(false);
          return setError(res.error);
        }
        try {
          if (shots.length > 0) await uploadScreenshots(`/api/ideas/${res.data.id}/images`, shots);
        } catch {
          // Idee ist gespeichert – nur ein Bild hat nicht geklappt → Idee öffnen, dort erneut hinzufügen
          setBusy(false);
          reset();
          router.push(`/ideen?i=${res.data.id}&bild=fehler`, { scroll: false });
          return;
        }
        setBusy(false);
        reset();
        router.refresh();
      }}
    >
      <p className="font-medium">Neue Projekt-Idee</p>
      {clients && (
        <select
          aria-label="Kunde"
          className={inputField}
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          disabled={busy}
        >
          <option value="">Für welchen Kunden?</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <input
        className={inputField}
        placeholder="Titel der Idee"
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
        autoFocus
      />
      <textarea
        className={inputField}
        rows={4}
        placeholder="Beschreibung (optional) – worum geht es, was ist wichtig?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={busy}
      />
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted">Priorität</span>
        <select
          aria-label="Priorität"
          className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          disabled={busy}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <ScreenshotPicker
        shots={shots}
        unit="Idee"
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
          {busy ? "Wird gespeichert …" : "Idee speichern"}
        </button>
      </div>
    </form>
  );
}

// ---------- Upvote ----------

export function IdeaVoteButton({
  ideaId,
  count,
  voted,
  size = "sm",
}: {
  ideaId: string;
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
          await toggleIdeaVote(ideaId);
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

// ---------- Status (Admins + Cutter) und Priorität (alle) ----------

function ColoredSelect({
  label,
  value,
  options,
  colors,
  labels,
  onSave,
}: {
  label: string;
  value: string;
  options: readonly string[];
  colors: Record<string, string>;
  labels: Record<string, string>;
  onSave: (next: string) => Promise<{ ok: boolean }>;
}) {
  const [current, setCurrent] = useState(value);
  const [busy, setBusy] = useState(false);
  const color = colors[current];
  return (
    <select
      aria-label={label}
      value={current}
      disabled={busy}
      className="rounded-md border px-2 py-1 text-xs font-medium"
      style={{ borderColor: color, color, background: `color-mix(in oklab, ${color} 12%, var(--surface))` }}
      onChange={async (e) => {
        const next = e.target.value;
        setCurrent(next);
        setBusy(true);
        const res = await onSave(next);
        setBusy(false);
        if (!res.ok) setCurrent(value);
      }}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {label === "Priorität" ? `Priorität: ${labels[o]}` : labels[o]}
        </option>
      ))}
    </select>
  );
}

export function IdeaStatusPicker({ ideaId, status }: { ideaId: string; status: string }) {
  return (
    <ColoredSelect
      label="Status"
      value={status}
      options={IDEA_STATUSES}
      colors={IDEA_STATUS_COLORS}
      labels={IDEA_STATUS_LABELS}
      onSave={(next) => setIdeaStatus(ideaId, next)}
    />
  );
}

export function IdeaPriorityPicker({ ideaId, priority }: { ideaId: string; priority: string }) {
  return (
    <ColoredSelect
      label="Priorität"
      value={priority}
      options={PRIORITIES}
      colors={PRIORITY_COLORS}
      labels={PRIORITY_LABELS}
      onSave={(next) => setIdeaPriority(ideaId, next)}
    />
  );
}

// Beim Öffnen: zugehörige Inbox-Meldungen als gelesen markieren
export function MarkIdeaRead({ ideaId }: { ideaId: string }) {
  useEffect(() => {
    markIdeaRead(ideaId);
  }, [ideaId]);
  return null;
}

// ---------- Kommentare ----------

export function IdeaCommentForm({ ideaId }: { ideaId: string }) {
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
        const res = await addIdeaComment(ideaId, body);
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

export type IdeaCommentView = {
  id: string;
  body: string;
  author: string;
  role: string | null;
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
};

export function IdeaComment({ c }: { c: IdeaCommentView }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  return (
    <li className="space-y-1.5 rounded-lg border border-line p-3" data-testid="idea-comment">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <span className="font-medium text-text">
          {c.author}
          {c.role && <span className="font-normal text-muted"> · {c.role}</span>}
        </span>
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
            const res = await editIdeaComment(c.id, draft);
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
          const res = await deleteIdeaComment(c.id);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setConfirm(false);
        }}
      />
    </li>
  );
}

// ---------- Screenshots & Löschen ----------

export function DeleteIdeaImageButton({ imageId }: { imageId: string }) {
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
        await deleteIdeaImage(imageId);
        setBusy(false);
      }}
    >
      ×
    </button>
  );
}

export function DeleteIdeaButton({ ideaId, title, closeHref }: { ideaId: string; title: string; closeHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="text-sm text-muted hover:text-danger" onClick={() => setOpen(true)}>
        Idee löschen
      </button>
      <ConfirmDialog
        open={open}
        title="Idee löschen?"
        message={<>„{title}“ wird mit allen Stimmen, Kommentaren und Screenshots endgültig gelöscht.</>}
        confirmLabel="Löschen"
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const res = await deleteIdea(ideaId);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setOpen(false);
          router.push(closeHref, { scroll: false });
        }}
      />
    </>
  );
}
