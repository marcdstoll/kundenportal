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

type FieldName = "customerId" | "title" | "videoLength" | "content" | "specialNotes" | "files";
type Errors = Partial<Record<FieldName, string>>;

// Rahmen normal oder rot (wie ValueState "Error" in Fiori)
function fieldClass(error?: string) {
  return `w-full rounded-md border bg-surface px-3 py-2 text-sm placeholder:text-muted/70 transition-colors disabled:opacity-60 ${
    error ? "border-danger bg-danger/5 focus-visible:outline-danger" : "border-line"
  }`;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className={`text-sm ${error ? "text-danger" : "text-muted"}`}>{label}</span>
      {children}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}

const EMPTY = { customerId: "", title: "", videoLength: "", content: "", specialNotes: "" };

export function NewJobForm({ clients, isAdmin }: Props) {
  const router = useRouter();
  const [values, setValues] = useState(EMPTY);
  const [format, setFormat] = useState<string>(FORMATS[0].value);
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [files, setFiles] = useState<FileState[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [success, setSuccess] = useState<string | null>(null);

  // Feld ändern und dessen Fehlermarkierung sofort entfernen
  function set(name: keyof typeof EMPTY, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
    setSuccess(null);
  }

  function validate(): Errors {
    const e: Errors = {};
    if (isAdmin && !values.customerId) e.customerId = "Bitte einen Client auswählen.";
    if (!values.title.trim()) e.title = "Bitte einen Titel eingeben.";
    if (!values.videoLength.trim()) e.videoLength = "Bitte die gewünschte Länge angeben.";
    if (!values.content.trim()) e.content = "Bitte kurz beschreiben, worum es geht.";
    if (!values.specialNotes.trim()) e.specialNotes = "Bitte ausfüllen – sonst einfach „keine“.";
    if (files.length === 0) e.files = "Bitte mindestens eine Datei auswählen.";
    return e;
  }

  function setProgress(index: number, progress: number) {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, progress } : f)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);

    try {
      // 1. Projekt anlegen (inkl. Ordner in Frame.io)
      setStep("Projekt wird angelegt …");
      const created = await createJob({
        title: values.title,
        format,
        platform,
        videoLength: values.videoLength,
        content: values.content,
        specialNotes: values.specialNotes,
        customerId: isAdmin ? values.customerId : undefined,
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

      // 4. Formular leeren – auch falls man auf der Seite bleibt
      const title = values.title;
      setValues(EMPTY);
      setFormat(FORMATS[0].value);
      setPlatform(PLATFORMS[0]);
      setFiles([]);
      setFileInputKey((k) => k + 1);
      setBusy(false);
      setStep(null);
      setSuccess(`„${title}“ wurde abgeschickt.`);
      router.push(isAdmin ? `/board?job=${jobId}` : "/kunde");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Etwas ist schiefgelaufen.");
      setBusy(false);
      setStep(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {isAdmin && (
        <Field label="Client" error={errors.customerId}>
          <select className={fieldClass(errors.customerId)} value={values.customerId} onChange={(e) => set("customerId", e.target.value)} disabled={busy}>
            <option value="">Client wählen …</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Titel" error={errors.title}>
        <input className={fieldClass(errors.title)} placeholder="Titel deines Projekts" value={values.title} onChange={(e) => set("title", e.target.value)} disabled={busy} />
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
          <select className={fieldClass()} value={platform} onChange={(e) => setPlatform(e.target.value)} disabled={busy}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Videolänge" error={errors.videoLength}>
          <input className={fieldClass(errors.videoLength)} placeholder="z. B. 30–60 Sekunden" value={values.videoLength} onChange={(e) => set("videoLength", e.target.value)} disabled={busy} />
        </Field>
      </div>

      <Field label="Inhalt" error={errors.content}>
        <textarea className={fieldClass(errors.content)} rows={4} placeholder="Worum geht es im Video?" value={values.content} onChange={(e) => set("content", e.target.value)} disabled={busy} />
      </Field>

      <Field label="Besonderheiten" error={errors.specialNotes}>
        <textarea className={fieldClass(errors.specialNotes)} rows={3} placeholder="Musik, Untertitel, Logo … sonst „keine“" value={values.specialNotes} onChange={(e) => set("specialNotes", e.target.value)} disabled={busy} />
      </Field>

      <div className="space-y-1.5">
        <label
          className={`block cursor-pointer space-y-2 rounded-xl border border-dashed p-5 text-center transition-colors hover:bg-surface/60 ${
            errors.files ? "border-danger bg-danger/5" : "border-line"
          }`}
        >
          <span className="block text-sm">Videomaterial und Assets auswählen</span>
          <span className="block text-xs text-muted">Mehrere Dateien möglich, auch große Videos</span>
          <input
            key={fileInputKey}
            type="file"
            multiple
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []).map((file) => ({ file, progress: 0 })));
              setErrors((er) => ({ ...er, files: undefined }));
              setSuccess(null);
            }}
          />
        </label>
        {errors.files && <span className="block text-xs text-danger">{errors.files}</span>}
      </div>

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
      {error && <p className="rounded-md border border-danger bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
      {Object.values(errors).some(Boolean) && (
        <p className="text-sm text-danger">Bitte die rot markierten Felder ausfüllen.</p>
      )}
      {success && (
        <p className="rounded-md px-3 py-2 text-sm" style={{ color: "var(--st-online)", background: "color-mix(in oklab, var(--st-online) 12%, transparent)" }}>
          {success}
        </p>
      )}

      <button disabled={busy} className="w-full rounded-md bg-accent py-2.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40">
        {busy ? "Wird hochgeladen – Fenster bitte offen lassen" : "Projekt absenden"}
      </button>
    </form>
  );
}
