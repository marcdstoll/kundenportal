"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addCutter,
  approveJob,
  claimJob,
  rejectJob,
  removeCutter,
  setFormat,
  setStatus,
  startJob,
  submitForReview,
  updateReviewUrl,
  type Result,
} from "@/app/actions";
import { uploadFile } from "@/lib/upload";
import { BilledToggle } from "./billed-toggle";
import { FORMATS, STATUSES, STATUS_LABELS } from "@/lib/status";

type Props = {
  job: {
    id: string;
    status: string;
    format: string;
    billed: boolean;
    reviewUrl: string | null;
    cutterIds: string[];
  };
  isAdmin: boolean;
  isAssigned: boolean;
  staff: { id: string; name: string }[];
};

const primary =
  "w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40";
const secondary =
  "rounded-md border border-line px-3 py-2 text-sm transition-colors hover:bg-raised disabled:opacity-40";
const field =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm placeholder:text-muted/70";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

// Alle Aktionen im Projekt-Panel, abhängig von Status und Rolle
export function JobControls({ job, isAdmin, isAssigned, staff }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [editLink, setEditLink] = useState(job.reviewUrl ?? "");
  const [newCutter, setNewCutter] = useState("");
  // Sofort anzeigen, was gewählt wurde (der Server bestätigt kurz danach)
  const [statusValue, setStatusValue] = useState(job.status);
  const [formatValue, setFormatValue] = useState(job.format);

  const canWork = isAssigned || isAdmin;

  async function run(action: () => Promise<Result>) {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (!res.ok) setError(res.error);
    router.refresh();
    return res.ok;
  }

  // Fertiges Video hochladen → danach automatisch "Wartet auf Feedback"
  async function uploadFinal(file: File) {
    setBusy(true);
    setError(null);
    try {
      await uploadFile(job.id, "fertig", file, setProgress);
      const res = await submitForReview(job.id);
      if (!res.ok) throw new Error(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    }
    setBusy(false);
    setProgress(null);
    router.refresh();
  }

  const otherStaff = staff.filter((s) => !job.cutterIds.includes(s.id));

  return (
    <div className="space-y-6 border-t border-line pt-5">
      {/* ---------- Nächster Schritt im Ablauf ---------- */}
      {job.status === "todo" && (
        <button disabled={busy} onClick={() => run(() => claimJob(job.id))} className={primary}>
          Projekt übernehmen
        </button>
      )}

      {job.status === "warteschlange" && canWork && (
        <button disabled={busy} onClick={() => run(() => startJob(job.id))} className={primary}>
          Bearbeitung starten
        </button>
      )}

      {job.status === "in_arbeit" && canWork && (
        <Section title="Zur Freigabe schicken">
          <label className="block space-y-1.5 rounded-lg border border-dashed border-line p-3 text-sm">
            <span className="block">Fertiges Video hochladen</span>
            <span className="block text-xs text-muted">
              Landet im Frame.io-Ordner des Projekts. Der Review-Link wird automatisch gesetzt.
            </span>
            <input
              type="file"
              accept="video/*"
              disabled={busy}
              className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-text"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFinal(file);
              }}
            />
            {progress !== null && (
              <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </label>
          <p className="text-center text-xs text-muted">oder vorhandenen Review-Link einfügen</p>
          <div className="flex gap-2">
            <input
              className={field}
              placeholder="https://f.io/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={busy}
            />
            <button
              disabled={busy || link.trim() === ""}
              onClick={() => run(() => submitForReview(job.id, link))}
              className={secondary}
            >
              Senden
            </button>
          </div>
        </Section>
      )}

      {job.status === "feedback" && isAdmin && (
        <Section title="Feedback">
          <button disabled={busy} onClick={() => run(() => approveJob(job.id))} className={primary}>
            Freigeben
          </button>
          <textarea
            className={field}
            rows={3}
            placeholder="Was soll der Cutter ändern? (z. B. „Schnitt bei 0:42 zu hart“)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
          <button
            disabled={busy}
            onClick={async () => {
              if (await run(() => rejectJob(job.id, note))) setNote("");
            }}
            className={`${secondary} w-full`}
          >
            Zurück in die Warteschlange
          </button>
        </Section>
      )}

      {/* ---------- Cutter verwalten ---------- */}
      {canWork && otherStaff.length > 0 && job.status !== "todo" && (
        <Section title="Cutter hinzufügen">
          <div className="flex gap-2">
            <select className={field} value={newCutter} onChange={(e) => setNewCutter(e.target.value)} disabled={busy}>
              <option value="">Cutter wählen…</option>
              {otherStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !newCutter}
              onClick={async () => {
                if (await run(() => addCutter(job.id, newCutter))) setNewCutter("");
              }}
              className={secondary}
            >
              Hinzufügen
            </button>
          </div>
        </Section>
      )}

      {/* ---------- Review-Link nachträglich ändern ---------- */}
      {canWork && !["todo", "warteschlange", "in_arbeit"].includes(job.status) && (
        <Section title="Review-Link ändern">
          <div className="flex gap-2">
            <input className={field} value={editLink} onChange={(e) => setEditLink(e.target.value)} disabled={busy} />
            <button disabled={busy} onClick={() => run(() => updateReviewUrl(job.id, editLink))} className={secondary}>
              Speichern
            </button>
          </div>
        </Section>
      )}

      {/* ---------- Nur Admins ---------- */}
      {isAdmin && (
        <Section title="Verwaltung">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted">
              <span>Status</span>
              <select
                className={field}
                value={statusValue}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value;
                  setStatusValue(next);
                  run(() => setStatus(job.id, next));
                }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted">
              <span>Format</span>
              <select
                className={field}
                value={formatValue}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value;
                  setFormatValue(next);
                  run(() => setFormat(job.id, next));
                }}
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 py-1 text-sm">
            <BilledToggle jobId={job.id} billed={job.billed} editable />
            Abgerechnet (Cutter)
          </label>
          {job.cutterIds.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {staff
                .filter((s) => job.cutterIds.includes(s.id))
                .map((s) => (
                  <button
                    key={s.id}
                    disabled={busy}
                    onClick={() => run(() => removeCutter(job.id, s.id))}
                    className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-rose-400/50 hover:text-rose-300"
                    title="Cutter entfernen"
                  >
                    {s.name} entfernen
                  </button>
                ))}
            </div>
          )}
        </Section>
      )}

      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
}
