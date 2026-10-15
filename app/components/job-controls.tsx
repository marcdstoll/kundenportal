"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addCutter,
  claimJob,
  reserveJob,
  startJob,
  markOnline,
  markReady,
  removeCutter,
  sendBack,
  submitForReview,
  updateReviewUrl,
  type Result,
} from "@/app/actions";
import { uploadFile } from "@/lib/upload";
import { BilledToggle } from "./billed-toggle";
import { buttonPrimary, buttonSecondary, inputField } from "./ui";

type Props = {
  job: {
    id: string;
    status: string;
    format: string;
    billed: boolean;
    billedCustomer: boolean;
    reviewUrl: string | null;
    cutterIds: string[];
    hasVideo: boolean;
    // Stornierung angefragt: Arbeit ruht, bis ein Admin entscheidet
    paused: boolean;
  };
  isAdmin: boolean;
  isAssigned: boolean;
  staff: { id: string; name: string }[];
};

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
  const [link, setLink] = useState("");
  const [editLink, setEditLink] = useState(job.reviewUrl ?? "");
  const [newCutter, setNewCutter] = useState("");

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

  // Video hochladen → landet in "ToBeReviewed", danach automatisch "Wartet auf Feedback"
  async function uploadVideo(file: File) {
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
      {job.status === "todo" && !job.paused && (
        <Section title="Projekt übernehmen">
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => run(() => reserveJob(job.id))} className={buttonSecondary} title="Kommt in deine Warteschlange, du startest später">
              Reservieren
            </button>
            <button disabled={busy} onClick={() => run(() => claimJob(job.id))} className={buttonPrimary}>
              Jetzt starten
            </button>
          </div>
          <p className="text-xs text-muted">Reservieren legt es in deine Warteschlange – andere sehen, dass es vergeben ist.</p>
        </Section>
      )}

      {job.status === "warteschlange" && canWork && !job.paused && (
        <Section title={job.hasVideo ? "Änderungen umsetzen" : "Aus der Warteschlange starten"}>
          {job.hasVideo && (
            <p className="text-xs text-muted">
              Das Projekt wurde zurückgeschickt. Feedback steht als Kommentar am Video in Frame.io.
            </p>
          )}
          <button disabled={busy} onClick={() => run(() => startJob(job.id))} className={`${buttonPrimary} w-full`}>
            Jetzt starten
          </button>
        </Section>
      )}

      {job.status === "warteschlange" && !canWork && (
        <p className="rounded-lg border border-line p-3 text-sm text-muted">
          Reserviert von {staff.filter((s) => job.cutterIds.includes(s.id)).map((s) => s.name).join(", ") || "einem Cutter"}.
        </p>
      )}

      {job.status === "in_arbeit" && canWork && !job.paused && (
        <Section title={job.hasVideo ? "Neue Version hochladen" : "Video hochladen"}>
          {job.hasVideo && (
            <p className="text-xs text-muted">Lade die überarbeitete Version hoch – die alte bleibt in Frame.io erhalten.</p>
          )}
          <label className="block cursor-pointer space-y-1.5 rounded-lg border border-dashed border-line p-4 text-sm transition-colors hover:bg-raised/50">
            <span className="block font-medium">Fertiges Video auswählen</span>
            <span className="block text-xs text-muted">
              Landet in Frame.io im Ordner „ToBeReviewed“. Der Review-Link wird automatisch gesetzt.
            </span>
            <input
              type="file"
              accept="video/*"
              disabled={busy}
              className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-text"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadVideo(file);
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
            <input className={inputField} placeholder="https://f.io/…" value={link} onChange={(e) => setLink(e.target.value)} disabled={busy} />
            <button disabled={busy || link.trim() === ""} onClick={() => run(() => submitForReview(job.id, link))} className={buttonSecondary}>
              Senden
            </button>
          </div>
        </Section>
      )}

      {job.status === "feedback" && !isAdmin && (
        <p className="rounded-lg border border-line p-3 text-sm text-muted">
          Die Admins schauen sich das Video an. Feedback kommt als Kommentar in Frame.io.
        </p>
      )}

      {job.status === "feedback" && isAdmin && (
        <Section title="Feedback">
          <p className="text-xs text-muted">Kommentare direkt am Video in Frame.io hinterlassen, dann entscheiden:</p>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => run(() => sendBack(job.id))} className={buttonSecondary}>
              Zurück in Warteschlange
            </button>
            <button disabled={busy} onClick={() => run(() => markReady(job.id))} className={buttonPrimary}>
              Ready to post
            </button>
          </div>
        </Section>
      )}

      {job.status === "ready_to_post" && isAdmin && (
        <button disabled={busy} onClick={() => run(() => markOnline(job.id))} className={`${buttonSecondary} w-full`}>
          Als online markieren
        </button>
      )}

      {/* ---------- Cutter verwalten ---------- */}
      {canWork && otherStaff.length > 0 && job.status !== "todo" && (
        <Section title="Cutter hinzufügen">
          <div className="flex gap-2">
            <select className={inputField} value={newCutter} onChange={(e) => setNewCutter(e.target.value)} disabled={busy}>
              <option value="">Cutter wählen …</option>
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
              className={buttonSecondary}
            >
              Hinzufügen
            </button>
          </div>
        </Section>
      )}

      {/* ---------- Review-Link von Hand ändern ---------- */}
      {canWork && !["todo", "warteschlange", "in_arbeit"].includes(job.status) && (
        <Section title="Review-Link ändern">
          <div className="flex gap-2">
            <input className={inputField} value={editLink} onChange={(e) => setEditLink(e.target.value)} disabled={busy} />
            <button disabled={busy} onClick={() => run(() => updateReviewUrl(job.id, editLink))} className={buttonSecondary}>
              Speichern
            </button>
          </div>
        </Section>
      )}

      {/* ---------- Nur Admins ---------- */}
      {isAdmin && (
        <Section title="Abrechnung">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <label className="flex items-center gap-2 py-1 text-sm">
              <BilledToggle jobId={job.id} billed={job.billedCustomer} editable which="kunde" />
              Kunde abgerechnet
            </label>
            <label className="flex items-center gap-2 py-1 text-sm">
              <BilledToggle jobId={job.id} billed={job.billed} editable which="cutter" />
              Cutter abgerechnet
            </label>
          </div>
          {job.cutterIds.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {staff
                .filter((s) => job.cutterIds.includes(s.id))
                .map((s) => (
                  <button
                    key={s.id}
                    disabled={busy}
                    onClick={() => run(() => removeCutter(job.id, s.id))}
                    className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-danger"
                    title="Cutter entfernen"
                  >
                    {s.name} entfernen
                  </button>
                ))}
            </div>
          )}
        </Section>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
