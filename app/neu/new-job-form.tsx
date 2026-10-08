"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createJob, submitJob } from "@/app/actions";
import { uploadFile } from "@/lib/upload";
import { FORMATS, PLATFORMS } from "@/lib/status";

type FileState = { file: File; progress: number };

type Props = {
  clients: { id: string; name: string }[];
  isAdmin: boolean;
};

const field =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 disabled:opacity-60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

export function NewJobForm({ clients, isAdmin }: Props) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<string>(FORMATS[0].value);
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [videoLength, setVideoLength] = useState("");
  const [content, setContent] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setProgress(index: number, progress: number) {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, progress } : f)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isAdmin && !customerId) {
      setError("Bitte einen Client auswählen.");
      return;
    }
    if (files.length === 0) {
      setError("Bitte mindestens eine Datei auswählen.");
      return;
    }
    setBusy(true);

    try {
      // 1. Projekt anlegen (inkl. Ordner in Frame.io)
      setStep("Projekt wird angelegt …");
      const created = await createJob({
        title,
        format,
        platform,
        videoLength,
        content,
        specialNotes,
        customerId: isAdmin ? customerId : undefined,
      });
      if (!created.ok) throw new Error(created.error);
      const { jobId } = created.data;

      // 2. Dateien nacheinander direkt zu Frame.io hochladen
      for (let i = 0; i < files.length; i++) {
        setStep(`Datei ${i + 1} von ${files.length} wird hochgeladen …`);
        await uploadFile(jobId, "roh", files[i].file, (p) => setProgress(i, p));
      }

      // 3. Abschicken → erscheint bei den Cuttern in "To Dos"
      setStep("Projekt wird abgeschickt …");
      const submitted = await submitJob(jobId);
      if (!submitted.ok) throw new Error(submitted.error);

      router.push(isAdmin ? `/board?job=${jobId}` : "/kunde");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Etwas ist schiefgelaufen.");
      setBusy(false);
      setStep(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {isAdmin && (
        <Field label="Client">
          <select className={field} value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={busy} required>
            <option value="">Client wählen …</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Titel">
        <input className={field} placeholder="z. B. Stress auf der Baustelle 10" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={busy} />
      </Field>

      <div className="space-y-1.5">
        <span className="text-sm text-muted">Format</span>
        <div className="grid grid-cols-3 gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              disabled={busy}
              onClick={() => setFormat(f.value)}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                format === f.value ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:bg-surface"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plattform">
          <select className={field} value={platform} onChange={(e) => setPlatform(e.target.value)} disabled={busy}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Videolänge">
          <input className={field} placeholder="z. B. 30–60 Sekunden" value={videoLength} onChange={(e) => setVideoLength(e.target.value)} required disabled={busy} />
        </Field>
      </div>

      <Field label="Inhalt">
        <textarea className={field} rows={4} placeholder="Worum geht es im Video?" value={content} onChange={(e) => setContent(e.target.value)} required disabled={busy} />
      </Field>

      <Field label="Besonderheiten">
        <textarea className={field} rows={3} placeholder="Musik, Untertitel, Logo … sonst „keine“" value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} required disabled={busy} />
      </Field>

      <label className="block cursor-pointer space-y-2 rounded-xl border border-dashed border-line p-5 text-center transition-colors hover:bg-surface/60">
        <span className="block text-sm">Videomaterial und Assets auswählen</span>
        <span className="block text-xs text-muted">Mehrere Dateien möglich, auch große Videos</span>
        <input
          type="file"
          multiple
          disabled={busy}
          className="sr-only"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((file) => ({ file, progress: 0 })))}
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-3 text-sm">
          {files.map((f, i) => (
            <li key={i} className="space-y-1">
              <div className="flex justify-between gap-3">
                <span className="truncate">{f.file.name}</span>
                <span className="shrink-0 text-muted">
                  {(f.file.size / 1024 / 1024).toFixed(1)} MB · {f.progress} %
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                <div className="h-full bg-accent transition-all" style={{ width: `${f.progress}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {step && <p className="text-sm text-muted">{step}</p>}
      {error && <p className="text-sm text-[var(--st-in_arbeit)]">{error}</p>}

      <button disabled={busy} className="w-full rounded-md bg-accent py-2.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40">
        {busy ? "Wird hochgeladen – Fenster bitte offen lassen" : "Projekt absenden"}
      </button>
    </form>
  );
}
