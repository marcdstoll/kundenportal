"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createJob, submitJob } from "@/app/actions";
import { uploadFile } from "@/lib/upload";
import { PLATFORMS } from "@/lib/status";

type FileState = { file: File; progress: number; error?: string };

export function NewJobForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
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
    if (files.length === 0) {
      setError("Bitte mindestens eine Datei auswählen.");
      return;
    }
    setBusy(true);

    try {
      // 1. Auftrag anlegen (inkl. Ordner in Frame.io)
      setStep("Auftrag wird angelegt…");
      const created = await createJob({ title, platform, videoLength, content, specialNotes });
      if (!created.ok) throw new Error(created.error);
      const { jobId } = created.data;

      // 2. Dateien nacheinander direkt zu Frame.io hochladen
      for (let i = 0; i < files.length; i++) {
        setStep(`Datei ${i + 1} von ${files.length} wird hochgeladen…`);
        await uploadFile(jobId, "roh", files[i].file, (p) => setProgress(i, p));
      }

      // 3. Abschicken → erscheint bei den Cuttern
      setStep("Auftrag wird abgeschickt…");
      const submitted = await submitJob(jobId);
      if (!submitted.ok) throw new Error(submitted.error);

      router.push("/kunde");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Etwas ist schiefgelaufen.");
      setBusy(false);
      setStep(null);
    }
  }

  const input = "w-full rounded border px-3 py-2 bg-transparent";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Titel des Auftrags *</span>
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required disabled={busy} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Plattform *</span>
          <select className={input} value={platform} onChange={(e) => setPlatform(e.target.value)} disabled={busy}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p} className="text-black">
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Videolänge *</span>
          <input className={input} placeholder="z. B. 30–60 Sekunden" value={videoLength} onChange={(e) => setVideoLength(e.target.value)} required disabled={busy} />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Inhalt *</span>
        <textarea className={input} rows={4} placeholder="Worum geht es im Video?" value={content} onChange={(e) => setContent(e.target.value)} required disabled={busy} />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Besonderheiten *</span>
        <textarea className={input} rows={3} placeholder="Musik, Untertitel, Logo, Deadline … (sonst „keine“)" value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} required disabled={busy} />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Dateien (Videomaterial, Assets) *</span>
        <input
          type="file"
          multiple
          disabled={busy}
          onChange={(e) =>
            setFiles(Array.from(e.target.files ?? []).map((file) => ({ file, progress: 0 })))
          }
          className="block w-full text-sm"
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-2 text-sm">
          {files.map((f, i) => (
            <li key={i}>
              <div className="flex justify-between">
                <span className="truncate">{f.file.name}</span>
                <span>{(f.file.size / 1024 / 1024).toFixed(1)} MB · {f.progress} %</span>
              </div>
              <div className="h-2 rounded bg-gray-300/30">
                <div className="h-2 rounded bg-blue-600 transition-all" style={{ width: `${f.progress}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {step && <p className="text-sm">{step}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <button disabled={busy} className="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50">
        {busy ? "Bitte warten – Fenster nicht schließen…" : "Auftrag absenden"}
      </button>
    </form>
  );
}
