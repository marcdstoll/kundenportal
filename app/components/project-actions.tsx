"use client";

// Interaktive Bausteine im Projekt-Panel (laufen im Browser).
// Jeder ruft eine Server Action auf; die Seite aktualisiert sich danach von selbst (refresh() im Server).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addComment,
  decideCancel,
  deleteJob,
  deleteJobFile,
  duplicateJob,
  markJobRead,
  requestCancel,
  clientApprove,
  clientRequestChanges,
  type Result,
} from "@/app/actions";
import { ACCEPT, ALLOWED_LABEL, filterAllowed } from "@/lib/file-types";
import { startNachreichen, useUploads } from "@/lib/upload-manager";
import { UploadOverview } from "./upload-tree";
import { buttonPrimary, buttonSecondary, inputField } from "./ui";
import { ConfirmDialog } from "./confirm-dialog";

function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-danger">{error}</p> : null;
}

// Beim Öffnen des Projekts: Inbox-Einträge dazu als gelesen markieren.
// Bewusst im Browser (useEffect) – so zählt nur wirklich geöffnet, nicht schon das Vorladen eines Links.
export function MarkRead({ jobId }: { jobId: string }) {
  useEffect(() => {
    markJobRead(jobId);
  }, [jobId]);
  return null;
}

// ---------- Material nachreichen ----------
// Läuft über den Upload-Manager: geht beim Schließen des Projekts oder Seitenwechsel nicht verloren.

export function AddFiles({
  jobId,
  title,
  label = "Material nachreichen",
}: {
  jobId: string;
  title: string;
  label?: string;
}) {
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const running = useUploads().some(
    (v) => v.jobId === jobId && v.kind === "nachreichen" && (v.status === "laeuft" || v.status === "wartet"),
  );

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-sm transition-colors hover:bg-raised/50">
        <span aria-hidden>＋</span>
        {running ? "Weitere Dateien hinzufügen" : label}
        <input
          key={inputKey}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            // Unerlaubte Dateien still aussortieren – Hinweis nur, wenn nichts übrig bleibt
            const picked = Array.from(e.target.files ?? []);
            const { allowed } = filterAllowed(picked);
            setError(picked.length > 0 && allowed.length === 0 ? `Dieser Dateityp wird nicht unterstützt.` : null);
            if (allowed.length) startNachreichen(jobId, title, allowed);
            setInputKey((k) => k + 1);
          }}
        />
      </label>
      <p className="text-xs text-muted">Erlaubt: {ALLOWED_LABEL}</p>
      <UploadOverview jobId={jobId} />
      <ErrorText error={error} />
    </div>
  );
}

// ---------- Löschen ----------

export function DeleteFileButton({ fileId, name }: { fileId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        title={`„${name}“ löschen`}
        aria-label={`„${name}“ löschen`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="shrink-0 rounded px-1.5 text-muted hover:bg-danger/10 hover:text-danger"
      >
        ✕
      </button>
      <ConfirmDialog
        open={open}
        title="Datei löschen?"
        message={
          <>
            „<b className="text-text">{name}</b>“ wird endgültig gelöscht.
          </>
        }
        confirmLabel="Löschen"
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const res = await deleteJobFile(fileId);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

export function DeleteJobButton({ jobId, title, afterHref }: { jobId: string; title: string; afterHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="w-full rounded-md border border-danger/40 px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
      >
        Projekt löschen
      </button>
      <ConfirmDialog
        open={open}
        title="Projekt löschen?"
        message={
          <>
            „<b className="text-text">{title}</b>“ wird mit allen Dateien endgültig gelöscht.
          </>
        }
        confirmLabel="Endgültig löschen"
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const res = await deleteJob(jobId);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setOpen(false);
          router.push(afterHref);
        }}
      />
    </>
  );
}

// ---------- Kommentare ----------

export function CommentForm({ jobId }: { jobId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const res = await addComment(jobId, text);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setText("");
    ref.current?.focus();
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        rows={2}
        className={inputField}
        placeholder="Kommentar schreiben …"
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <ErrorText error={error} />
        <button type="button" disabled={busy || !text.trim()} onClick={send} className={`${buttonPrimary} ml-auto`}>
          Senden
        </button>
      </div>
    </div>
  );
}

// ---------- Duplizieren ----------

export function DuplicateForm({ jobId, suggestion, hrefFor }: { jobId: string; suggestion: string; hrefFor: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(suggestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res: Result<{ jobId: string; title: string }> = await duplicateJob(jobId, title);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    // Zum neuen Projekt springen (hrefFor enthält "JOBID" als Platzhalter)
    router.push(hrefFor.replace("JOBID", res.data.jobId), { scroll: false });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={inputField}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          aria-label="Titel des Duplikats"
        />
        <button type="button" disabled={busy || !title.trim()} onClick={run} className={`${buttonSecondary} shrink-0`}>
          Duplizieren
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

// ---------- Stornierung ----------

export function CancelRequestForm({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted underline-offset-2 hover:text-danger hover:underline"
      >
        Stornierung anfragen …
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-danger/30 p-3">
      <p className="text-sm">
        Das Projekt ist schon in Arbeit und kann nicht mehr gelöscht werden. Du kannst eine Stornierung anfragen – der
        Cutter pausiert sofort, und unser Team meldet sich mit einer Entscheidung.
      </p>
      <textarea
        rows={2}
        className={inputField}
        placeholder="Grund (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className={buttonSecondary}>
          Abbrechen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await requestCancel(jobId, reason);
            setBusy(false);
            if (!res.ok) setError(res.error);
          }}
          className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Stornierung anfragen
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

export function CancelDecision({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const res = await decideCancel(jobId, approve);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setConfirming(false);
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => decide(false)} className={buttonSecondary}>
          Ablehnen – weitermachen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(true)}
          className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Stornieren
        </button>
      </div>
      {!confirming && <ErrorText error={error} />}
      <ConfirmDialog
        open={confirming}
        title="Projekt stornieren?"
        message="Das Projekt wird storniert. Kunde und Cutter werden informiert."
        confirmLabel="Stornieren"
        busy={busy}
        error={error}
        onCancel={() => setConfirming(false)}
        onConfirm={() => decide(true)}
      />
    </div>
  );
}

// "Neu"-Markierung, die stehen bleibt, solange das Projekt offen ist.
// Hintergrund: Beim Öffnen wird alles als gelesen gespeichert und der Server liefert danach "nicht neu" –
// der Zustand hier merkt sich den Wert vom Öffnen, damit man sieht, WAS neu war.
export function NewMarker({ show }: { show: boolean }) {
  const [wasNew] = useState(show);
  if (!wasNew && !show) return null;
  return (
    <span
      className="shrink-0 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white"
      style={{ background: "var(--rec)" }}
    >
      Neu
    </span>
  );
}

// Kunde entscheidet: freigeben oder Änderungen wünschen
export function ClientDecision({ jobId }: { jobId: string }) {
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    const res = await clientApprove(jobId);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  async function requestChanges() {
    if (!text.trim()) return setError("Bitte beschreib kurz, was geändert werden soll.");
    setBusy(true);
    setError(null);
    // Wunsch wird als Kommentar gespeichert, damit der Cutter ihn sieht
    const res = await clientRequestChanges(jobId, text);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  if (mode === "changes") {
    return (
      <div className="space-y-2">
        <textarea
          rows={3}
          className={inputField}
          placeholder="Was soll geändert werden? (wird als Kommentar gespeichert)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={() => setMode("idle")} disabled={busy}>
            Abbrechen
          </button>
          <button type="button" className={buttonPrimary} onClick={requestChanges} disabled={busy}>
            Änderungen senden
          </button>
        </div>
        <ErrorText error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={buttonSecondary} onClick={() => setMode("changes")} disabled={busy}>
          Zurückschicken
        </button>
        <button type="button" className={buttonPrimary} onClick={approve} disabled={busy}>
          Video freigeben
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
