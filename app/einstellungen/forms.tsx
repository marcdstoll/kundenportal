"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeOnboardingVideo, sendTestMail } from "@/app/admin-actions";
import { uploadOnboardingVideo } from "@/lib/upload";
import { WelcomePlayer } from "@/app/components/welcome-recorder";
import { buttonSecondary, inputField } from "@/app/components/ui";

// Onboarding-Video für eine Rolle: hochladen (landet in Frame.io), ansehen, ersetzen, entfernen
export function OnboardingVideo({
  role,
  label,
  value,
}: {
  role: "kunde" | "cutter";
  label: string;
  value: string | null;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const fileId = value?.startsWith("frameio:") ? value.slice("frameio:".length) : null;
  const oldLink = value && !fileId ? value : null;

  async function upload(file: File) {
    setMsg(null);
    setProgress(0);
    try {
      await uploadOnboardingVideo(role, file, setProgress);
      setMsg({ ok: true, text: "✓ Gespeichert. Frame.io bereitet das Video kurz auf, dann ist es abspielbar." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Upload fehlgeschlagen." });
    }
    setProgress(null);
    setInputKey((k) => k + 1);
  }

  return (
    <div className="space-y-2" data-testid={`onboarding-${role}`}>
      <p className="text-sm text-muted">{label}</p>
      {fileId && progress === null && <WelcomePlayer key={fileId} src={`/api/onboarding/${role}?f=${fileId}`} />}
      {oldLink && (
        <p className="text-sm">
          Bisher ist ein Link hinterlegt:{" "}
          <a href={oldLink} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">
            {oldLink}
          </a>
          <span className="block text-xs text-muted">
            Lade das Video hier hoch, dann läuft es direkt im Portal – ohne YouTube oder Vimeo.
          </span>
        </p>
      )}
      {progress !== null ? (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Wird zu Frame.io hochgeladen – Seite bitte offen lassen</span>
            <span className="text-muted">{progress} %</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${buttonSecondary} cursor-pointer`}>
            {fileId ? "Video ersetzen" : "Video hochladen"}
            <input
              key={inputKey}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              className="px-2 text-sm text-muted hover:text-danger"
              onClick={async () => {
                const res = await removeOnboardingVideo(role);
                setMsg(res.ok ? null : { ok: false, text: res.error });
                router.refresh();
              }}
            >
              Entfernen
            </button>
          )}
        </div>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-[var(--st-online)]" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}

export function TestMailButton({ defaultTo }: { defaultTo: string }) {
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const res = await sendTestMail(to);
        setBusy(false);
        setMsg(res.ok ? { ok: true, text: `Testmail an ${res.data.to} verschickt ✓` } : { ok: false, text: res.error });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          className={`${inputField} min-w-0 flex-1`}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={busy}
          aria-label="Testmail an"
          placeholder="E-Mail-Adresse"
        />
        <button className={`${buttonSecondary} shrink-0`} disabled={busy || !to.trim()}>
          {busy ? "Wird gesendet …" : "Testmail senden"}
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-[var(--st-online)]" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}
