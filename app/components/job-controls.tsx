"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addCutter,
  claimJob,
  clientApprove,
  clientRequestChanges,
  reserveJob,
  startJob,
  markOnline,
  removeCutter,
  sendBack,
  sendToClient,
  submitForReview,
  updateReviewUrl,
  type Result,
} from "@/app/actions";
import { startReviewUpload, useUploads } from "@/lib/upload-manager";
import { UploadOverview } from "./upload-tree";
import { BilledToggle } from "./billed-toggle";
import { MultiSelect } from "./multi-select";
import { buttonPrimary, buttonSecondary, inputField } from "./ui";

type Props = {
  job: {
    id: string;
    title: string;
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
  // Wird direkt über der Abrechnung angezeigt (z. B. "Projekt löschen")
  beforeBilling?: React.ReactNode;
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
export function JobControls({ job, isAdmin, isAssigned, staff, beforeBilling }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [editLink, setEditLink] = useState(job.reviewUrl ?? "");

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

  // Video hochladen → läuft über den Upload-Manager weiter, auch wenn das Panel geschlossen wird
  // (Fortschritt in der Seitenleiste). Danach automatisch "Wartet auf Feedback".
  const reviewRunning = useUploads().some(
    (v) => v.jobId === job.id && v.kind === "review" && (v.status === "laeuft" || v.status === "wartet"),
  );

  return (
    <div className="space-y-6 border-t border-line pt-5">
      {/* ---------- Nächster Schritt im Ablauf ---------- */}
      {job.status === "todo" && !job.paused && (
        <Section title="Projekt übernehmen">
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={busy}
              onClick={() => run(() => reserveJob(job.id))}
              className={buttonSecondary}
              title="Kommt in deine Warteschlange, du startest später"
            >
              Reservieren
            </button>
            <button disabled={busy} onClick={() => run(() => claimJob(job.id))} className={buttonPrimary}>
              Jetzt starten
            </button>
          </div>
        </Section>
      )}

      {job.status === "warteschlange" && canWork && !job.paused && (
        <Section title={job.hasVideo ? "Änderungen umsetzen" : "Aus der Warteschlange starten"}>
          {job.hasVideo && <p className="text-xs text-muted">Zurückgeschickt – Feedback steht in Frame.io.</p>}
          <button disabled={busy} onClick={() => run(() => startJob(job.id))} className={`${buttonPrimary} w-full`}>
            Jetzt starten
          </button>
        </Section>
      )}

      {job.status === "warteschlange" && !canWork && (
        <p className="rounded-lg border border-line p-3 text-sm text-muted">
          Reserviert von{" "}
          {staff
            .filter((s) => job.cutterIds.includes(s.id))
            .map((s) => s.name)
            .join(", ") || "einem Cutter"}
          .
        </p>
      )}

      {job.status === "in_arbeit" && canWork && !job.paused && (
        <Section title={job.hasVideo ? "Neue Version hochladen" : "Video hochladen"}>
          <label className="block cursor-pointer space-y-1.5 rounded-lg border border-dashed border-line p-4 text-sm transition-colors hover:bg-raised/50">
            <span className="block font-medium">Fertiges Video auswählen</span>
            <input
              type="file"
              accept="video/*"
              disabled={busy || reviewRunning}
              className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-text"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) startReviewUpload(job.id, job.title, file);
                e.target.value = "";
              }}
            />
          </label>
          <UploadOverview jobId={job.id} kind="review" />
          {reviewRunning && (
            <p className="text-xs text-muted">
              Du kannst das Fenster schließen – der Upload läuft im Hintergrund weiter.
            </p>
          )}
          <p className="text-center text-xs text-muted">oder vorhandenen Review-Link einfügen</p>
          <div className="flex gap-2">
            <input
              className={inputField}
              placeholder="https://f.io/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={busy}
            />
            <button
              disabled={busy || reviewRunning || link.trim() === ""}
              onClick={() => run(() => submitForReview(job.id, link))}
              className={buttonSecondary}
            >
              Senden
            </button>
          </div>
        </Section>
      )}

      {job.status === "feedback" && !isAdmin && (
        <p className="rounded-lg border border-line p-3 text-sm text-muted">Wartet auf Feedback.</p>
      )}
      {job.status === "feedback" && isAdmin && (
        <Section title="Feedback">
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => run(() => sendBack(job.id))} className={buttonSecondary}>
              Zurück in Warteschlange
            </button>
            <button disabled={busy} onClick={() => run(() => sendToClient(job.id))} className={buttonPrimary}>
              An Kunden schicken
            </button>
          </div>
        </Section>
      )}

      {job.status === "feedback_client" && !isAdmin && (
        <p className="rounded-lg border border-line p-3 text-sm text-muted">Wartet auf Kunden-Feedback.</p>
      )}
      {job.status === "feedback_client" && isAdmin && (
        <Section title="Kunden-Feedback">
          <p className="text-xs text-muted">Der Kunde entscheidet – oder du entscheidest für ihn.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={busy}
              onClick={() => run(() => clientRequestChanges(job.id, ""))}
              className={buttonSecondary}
            >
              Zurück in Warteschlange
            </button>
            <button disabled={busy} onClick={() => run(() => clientApprove(job.id))} className={buttonPrimary}>
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

      {/* ---------- Cutter verwalten (Mehrfachauswahl) ---------- */}
      {canWork && job.status !== "todo" && (
        <Section title="Cutter">
          <MultiSelect
            label="Cutter"
            options={staff.map((s) => ({ value: s.id, label: s.name }))}
            value={job.cutterIds}
            // Entfernen dürfen nur Admins
            locked={isAdmin ? [] : job.cutterIds}
            placeholder="Cutter wählen …"
            disabled={busy}
            onChange={(next) => {
              const added = next.find((id) => !job.cutterIds.includes(id));
              const removed = job.cutterIds.find((id) => !next.includes(id));
              if (added) run(() => addCutter(job.id, added));
              else if (removed) run(() => removeCutter(job.id, removed));
            }}
          />
        </Section>
      )}

      {/* ---------- Review-Link von Hand ändern ---------- */}
      {canWork && !["todo", "warteschlange", "in_arbeit"].includes(job.status) && (
        <Section title="Review-Link ändern">
          <div className="flex gap-2">
            <input
              className={inputField}
              value={editLink}
              onChange={(e) => setEditLink(e.target.value)}
              disabled={busy}
            />
            <button
              disabled={busy}
              onClick={() => run(() => updateReviewUrl(job.id, editLink))}
              className={buttonSecondary}
            >
              Speichern
            </button>
          </div>
        </Section>
      )}

      {beforeBilling}

      {/* ---------- Abrechnung (nur Admins, ganz unten) ---------- */}
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
        </Section>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
