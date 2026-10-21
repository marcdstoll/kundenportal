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
import { FEATURE_STATUSES, FEATURE_STATUS_COLORS, FEATURE_STATUS_LABELS, MAX_SCREENSHOT_TOTAL } from "@/lib/features";

// ---------- Screenshots: gleich beim Auswählen verkleinern, dann hochladen ----------
// Beliebig viele Bilder pro Vorschlag, zusammen höchstens 5 MB (nach dem Verkleinern).

const MAX_EDGE = 2000; // längste Kante in Pixeln – reicht für gut lesbare Screenshots
const MAX_ORIGINAL = 50 * 1024 * 1024; // noch größere Dateien gar nicht erst einlesen

type Shot = { name: string; blob: Blob; url: string };

// 1,2 MB bzw. 340 KB bzw. 5 MB
function fmtMB(bytes: number) {
  if (bytes < 100 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(Math.round((bytes / 1024 / 1024) * 10) / 10).toLocaleString("de-DE")} MB`;
}

async function shrinkScreenshot(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  // WebP ist am kleinsten; ältere Browser können es nicht erzeugen → JPEG
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob("image/jpeg");
  if (!jpeg) throw new Error("Bild konnte nicht verarbeitet werden.");
  return jpeg;
}

async function uploadScreenshots(featureId: string, shots: Shot[]) {
  for (const shot of shots) {
    const res = await fetch(`/api/features/${featureId}/images`, {
      method: "POST",
      headers: { "Content-Type": shot.blob.type },
      body: shot.blob,
    });
    if (!res.ok) throw new Error((await res.text()) || "Screenshot konnte nicht gespeichert werden.");
  }
}

const releaseShots = (shots: Shot[]) => shots.forEach((s) => URL.revokeObjectURL(s.url));

// Auswahl mit kleinen Vorschaubildern und Speicheranzeige (vor dem Absenden)
function ScreenshotPicker({
  shots,
  onChange,
  used = 0,
  disabled,
}: {
  shots: Shot[];
  onChange: (shots: Shot[], error: string | null) => void;
  used?: number; // schon gespeicherte Bytes dieses Vorschlags
  disabled?: boolean;
}) {
  const [working, setWorking] = useState(false);
  const total = used + shots.reduce((sum, s) => sum + s.blob.size, 0);
  const full = total >= MAX_SCREENSHOT_TOTAL;

  async function add(files: File[]) {
    if (files.some((f) => !f.type.startsWith("image/")))
      return onChange(shots, "Bitte nur Bilder (PNG, JPG, WebP) auswählen.");
    if (files.some((f) => f.size > MAX_ORIGINAL)) return onChange(shots, "Ein Bild ist zu groß (max. 50 MB).");
    setWorking(true);
    const next = [...shots];
    let sum = total;
    let skipped = 0;
    let broken = 0;
    for (const file of files) {
      try {
        const blob = await shrinkScreenshot(file);
        if (sum + blob.size > MAX_SCREENSHOT_TOTAL) {
          skipped++;
          continue;
        }
        sum += blob.size;
        next.push({ name: file.name, blob, url: URL.createObjectURL(blob) });
      } catch {
        broken++;
      }
    }
    setWorking(false);
    const error = skipped
      ? `Zusammen höchstens ${fmtMB(MAX_SCREENSHOT_TOTAL)} pro Vorschlag – ${skipped === 1 ? "ein Bild passt" : `${skipped} Bilder passen`} nicht mehr hinein.`
      : broken
        ? "Ein Bild konnte nicht gelesen werden."
        : null;
    onChange(next, error);
  }

  return (
    <div className="space-y-2">
      {shots.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {shots.map((s, i) => (
            <li key={s.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- lokale Vorschau */}
              <img
                src={s.url}
                alt={s.name}
                title={`${s.name} · ${fmtMB(s.blob.size)}`}
                className="size-16 rounded-md border border-line object-cover"
              />
              <button
                type="button"
                disabled={disabled}
                aria-label={`${s.name} entfernen`}
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-line bg-surface text-xs text-muted hover:text-danger"
                onClick={() => {
                  URL.revokeObjectURL(s.url);
                  onChange(
                    shots.filter((_, j) => j !== i),
                    null,
                  );
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 text-sm text-accent hover:underline ${disabled || working ? "pointer-events-none opacity-50" : ""}`}
        >
          {working ? "Bilder werden verkleinert …" : "+ Screenshots hinzufügen"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="sr-only"
            disabled={disabled || working}
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = "";
              if (picked.length) add(picked);
            }}
          />
        </label>
      )}
      <p className="text-xs text-muted" data-testid="screenshot-usage">
        {total > 0
          ? `${fmtMB(total)} von ${fmtMB(MAX_SCREENSHOT_TOTAL)} belegt.`
          : `Optional – beliebig viele Bilder, zusammen bis ${fmtMB(MAX_SCREENSHOT_TOTAL)}.`}{" "}
        Bilder werden automatisch verkleinert.
      </p>
    </div>
  );
}

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
          if (shots.length > 0) await uploadScreenshots(res.data.id, shots);
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

// ---------- Screenshots im geöffneten Vorschlag ----------

export function AddScreenshots({ featureId, used }: { featureId: string; used: number }) {
  const router = useRouter();
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <ScreenshotPicker
        shots={shots}
        used={used}
        disabled={busy}
        onChange={(next, err) => {
          setShots(next);
          setError(err);
        }}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      {shots.length > 0 && (
        <button
          type="button"
          className={buttonPrimary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await uploadScreenshots(featureId, shots);
              releaseShots(shots);
              setShots([]);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
            }
            setBusy(false);
            router.refresh();
          }}
        >
          {busy ? "Wird hochgeladen …" : `${shots.length} Screenshot${shots.length === 1 ? "" : "s"} speichern`}
        </button>
      )}
    </div>
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
