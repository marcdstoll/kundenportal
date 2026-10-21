"use client";

// Formulare der Nutzerverwaltung (nur Admins). Die Logik liegt in app/admin-actions.ts.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithInvite,
  regenerateInvite,
  removeWelcomeVideo,
  setAssignment,
  updateProfile,
  deleteCustomer,
  deleteCutter,
} from "@/app/admin-actions";
import { uploadWelcomeVideo } from "@/lib/upload";
import { Avatar, buttonPrimary, buttonSecondary, inputField } from "./ui";
import { MultiSelect } from "./multi-select";
import { WelcomePlayer, WelcomeRecorder } from "./welcome-recorder";
import { ConfirmDialog } from "./confirm-dialog";

function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-danger">{error}</p> : null;
}

function SuccessText({ text }: { text: string | null }) {
  return text ? <p className="text-sm text-[var(--st-online)]">{text}</p> : null;
}

const timeNow = () => new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

// ---------- Neuer Kunde / neuer Cutter ----------
// Die Einladung geht per E-Mail raus; der Link selbst wird nicht angezeigt.

export function NewUserForm({ role }: { role: "kunde" | "cutter" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);
  // Optionales persönliches Begrüßungsvideo (wird nach dem Anlegen hochgeladen, dann geht die Einladung raus)
  const [video, setVideo] = useState<{ blob: Blob; url: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const label = role === "kunde" ? "Neuer Kunde" : "Neuer Cutter";

  function dropVideo() {
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonPrimary}
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
        >
          + {label}
        </button>
        {done && <p className={`text-sm ${done.ok ? "text-[var(--st-online)]" : "text-danger"}`}>{done.text}</p>}
      </div>
    );
  }

  return (
    <form
      className="w-full max-w-xl space-y-3 rounded-xl border border-line bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await createUserWithInvite({ name, email, phone, role, deferMail: !!video });
        if (!res.ok) {
          setBusy(false);
          return setError(res.error);
        }
        let mailError = res.data.mailError;
        let videoError: string | null = null;
        if (video) {
          // Erst das Video hochladen, dann die Einladung schicken – so ist es beim Klick auf den Link schon da
          setProgress(0);
          try {
            await uploadWelcomeVideo(res.data.userId, video.blob, setProgress);
          } catch (err) {
            videoError = err instanceof Error ? err.message : "Upload fehlgeschlagen.";
          }
          setProgress(null);
          const sent = await regenerateInvite(res.data.userId);
          mailError = sent.ok ? null : sent.error;
        }
        setBusy(false);
        setDone(
          mailError
            ? {
                ok: false,
                text: `${name} ist angelegt, aber die Einladung konnte nicht verschickt werden: ${mailError} In der Detailansicht kannst du sie erneut senden.`,
              }
            : videoError
              ? {
                  ok: false,
                  text: `Einladung an ${res.data.email} verschickt – aber ohne Video (${videoError}). Du kannst es in der Detailansicht nachholen.`,
                }
              : {
                  ok: true,
                  text: `✓ Einladung an ${res.data.email} verschickt${video ? " – mit persönlichem Video" : ""}.`,
                },
        );
        dropVideo();
        setName("");
        setEmail("");
        setPhone("");
        setOpen(false);
        router.refresh();
      }}
    >
      <p className="font-medium">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={inputField}
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <input
          className={inputField}
          type="email"
          placeholder="E-Mail (Login)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <input
          className={inputField}
          placeholder="Telefon (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={busy}
        />
      </div>

      {/* Persönliches Begrüßungsvideo (optional) */}
      {recording ? (
        <WelcomeRecorder
          onAccept={(blob) => {
            dropVideo();
            setVideo({ blob, url: URL.createObjectURL(blob) });
            setRecording(false);
          }}
          onCancel={() => setRecording(false)}
        />
      ) : video ? (
        <div className="space-y-2 rounded-lg border border-line p-3">
          <p className="text-sm font-medium">Persönliches Begrüßungsvideo</p>
          <video src={video.url} controls playsInline className="aspect-video w-full rounded-md bg-black" />
          {!busy && (
            <div className="flex gap-3 text-sm">
              <button type="button" className="text-muted hover:text-text" onClick={() => setRecording(true)}>
                Neu aufnehmen
              </button>
              <button type="button" className="text-muted hover:text-danger" onClick={dropVideo}>
                Entfernen
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-sm text-muted transition-colors hover:bg-raised/50 hover:text-text"
          onClick={() => setRecording(true)}
          disabled={busy}
        >
          <span aria-hidden>🎥</span> Persönliches Begrüßungsvideo aufnehmen (optional)
        </button>
      )}

      {progress !== null && (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Video wird hochgeladen – Fenster bitte offen lassen</span>
            <span className="text-muted">{progress} %</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      <ErrorText error={error} />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className={buttonSecondary}
          onClick={() => {
            dropVideo();
            setRecording(false);
            setOpen(false);
          }}
          disabled={busy}
        >
          Abbrechen
        </button>
        <button className={buttonPrimary} disabled={busy || recording}>
          {busy ? (progress !== null ? "Video wird hochgeladen …" : "Wird angelegt …") : "Anlegen & Einladung senden"}
        </button>
      </div>
    </form>
  );
}

// Einladung bzw. Link zum Passwort-Zurücksetzen per E-Mail – beliebig oft
export function RegenerateInvite({ userId, invited }: { userId: string; invited: boolean }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={buttonSecondary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          setSent(null);
          const res = await regenerateInvite(userId);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setSent(`✓ E-Mail an ${res.data.to} verschickt (${timeNow()} Uhr).`);
        }}
      >
        {busy ? "Wird gesendet …" : invited ? "Einladung per E-Mail senden" : "Passwort-Link per E-Mail senden"}
      </button>
      <SuccessText text={sent} />
      <ErrorText error={error} />
    </div>
  );
}

// ---------- Begrüßungsvideo in der Detailansicht ----------

export function WelcomeVideoSection({
  userId,
  hasVideo,
  version,
}: {
  userId: string;
  hasVideo: boolean;
  version: number;
}) {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (recording) {
    return (
      <WelcomeRecorder
        acceptLabel="Video speichern"
        onCancel={() => setRecording(false)}
        onAccept={async (blob) => {
          setRecording(false);
          setMsg(null);
          setProgress(0);
          try {
            await uploadWelcomeVideo(userId, blob, setProgress);
            setMsg({ ok: true, text: "✓ Gespeichert. Es wird beim Öffnen der Einladung gezeigt." });
            router.refresh();
          } catch (err) {
            setMsg({ ok: false, text: err instanceof Error ? err.message : "Upload fehlgeschlagen." });
          }
          setProgress(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-2">
      {hasVideo && progress === null && <WelcomePlayer key={version} src={`/api/welcome/${userId}?v=${version}`} />}
      {progress !== null ? (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Wird hochgeladen – Fenster bitte offen lassen</span>
            <span className="text-muted">{progress} %</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonSecondary} onClick={() => setRecording(true)}>
            {hasVideo ? "Neu aufnehmen" : "🎥 Video aufnehmen"}
          </button>
          {hasVideo && (
            <button
              type="button"
              className="px-2 text-sm text-muted hover:text-danger"
              onClick={async () => {
                const res = await removeWelcomeVideo(userId);
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

// ---------- Profil ----------

// Bild im Browser auf max. 256 px verkleinern und als WebP speichern (klein genug für die Datenbank)
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

export function ProfileForm({
  person,
  logoUrl,
  showNotes,
}: {
  person: {
    id: string;
    name: string;
    phone: string | null;
    links: string | null;
    notes: string | null;
    birthday: string | null;
  };
  logoUrl: string | null;
  showNotes: boolean;
}) {
  const [name, setName] = useState(person.name);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [links, setLinks] = useState(person.links ?? "");
  const [notes, setNotes] = useState(person.notes ?? "");
  const [birthday, setBirthday] = useState(person.birthday ?? "");
  // undefined = Logo nicht geändert, null = entfernen, string = neues Logo
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const preview = logo === undefined ? logoUrl : logo;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await updateProfile(person.id, { name, phone, links, notes, birthday, logo });
        setBusy(false);
        if (!res.ok) return setError(res.error);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }}
    >
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} size="lg" logoUrl={preview} />
        <div className="space-y-1">
          <label className={`${buttonSecondary} inline-block cursor-pointer`}>
            Logo auswählen
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  setLogo(await shrinkImage(f));
                } catch {
                  setError("Das Bild konnte nicht gelesen werden.");
                }
              }}
            />
          </label>
          {preview && (
            <button type="button" className="block text-xs text-muted hover:text-danger" onClick={() => setLogo(null)}>
              Logo entfernen
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted">Name</span>
          <input className={inputField} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Telefon</span>
          <input className={inputField} value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Geburtstag</span>
          <input
            type="date"
            className={inputField}
            value={birthday}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBirthday(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>
      {showNotes && (
        <>
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Links (einer pro Zeile – z. B. Instagram, TikTok, Drive)</span>
            <textarea
              rows={3}
              className={inputField}
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Infos für die Cutter (Stil, Do&apos;s & Don&apos;ts, Ansprechpartner …)</span>
            <textarea
              rows={4}
              className={inputField}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
            />
          </label>
        </>
      )}
      <ErrorText error={error} />
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-[var(--st-online)]">Gespeichert ✓</span>}
        <button className={buttonPrimary} disabled={busy}>
          Speichern
        </button>
      </div>
    </form>
  );
}

// ---------- Freigaben ----------

// Dropdown mit Mehrfachauswahl: welche Cutter einen Kunden betreuen (bzw. welche Kunden ein Cutter betreut).
// side="client": wir sind auf der Kundenseite, die Auswahl sind Cutter – und umgekehrt.
export function AssignmentSelect({
  side,
  ownerId,
  options,
  initial,
  label,
  placeholder,
}: {
  side: "client" | "cutter";
  ownerId: string;
  options: { value: string; label: string }[];
  initial: string[];
  label: string;
  placeholder: string;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string[]) {
    const before = value;
    setValue(next);
    setError(null);
    const added = next.filter((v) => !before.includes(v));
    const removed = before.filter((v) => !next.includes(v));
    for (const [id, on] of [...added.map((v) => [v, true] as const), ...removed.map((v) => [v, false] as const)]) {
      const res = side === "client" ? await setAssignment(id, ownerId, on) : await setAssignment(ownerId, id, on);
      if (!res.ok) {
        setValue(before);
        setError(res.error);
        return;
      }
    }
  }

  return (
    <div className="space-y-1.5">
      <MultiSelect options={options} value={value} onChange={change} label={label} placeholder={placeholder} />
      <ErrorText error={error} />
    </div>
  );
}

export function DeleteCustomerButton({ customerId, name }: { customerId: string; name: string }) {
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
        Kunden löschen
      </button>
      <ConfirmDialog
        open={open}
        title="Kunden löschen?"
        message={
          <>
            „<b className="text-text">{name}</b>“ wird mit <b className="text-text">allen Projekten und Dateien</b>{" "}
            endgültig gelöscht – auch in Frame.io. Das lässt sich nicht rückgängig machen.
          </>
        }
        confirmLabel="Endgültig löschen"
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const res = await deleteCustomer(customerId);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setOpen(false);
          router.push("/clients");
        }}
      />
    </>
  );
}

// Cutter löschen: nur Zugang + Profil. Projekte, Dateien und Kommentare bleiben erhalten.
export function DeleteCutterButton({
  cutterId,
  name,
  activeAlone,
}: {
  cutterId: string;
  name: string;
  activeAlone: number; // laufende Projekte, in denen er der einzige Cutter ist
}) {
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
        Cutter löschen
      </button>
      <ConfirmDialog
        open={open}
        title="Cutter löschen?"
        message={
          <>
            Der Zugang von „<b className="text-text">{name}</b>“ wird endgültig gelöscht.{" "}
            <b className="text-text">Projekte, Dateien und Kommentare bleiben erhalten</b> – auch in Frame.io.
            {activeAlone > 0 && (
              <>
                {" "}
                {activeAlone === 1 ? "Ein laufendes Projekt hat" : `${activeAlone} laufende Projekte haben`} danach
                keinen Cutter mehr und {activeAlone === 1 ? "muss" : "müssen"} neu zugeteilt werden.
              </>
            )}
          </>
        }
        confirmLabel="Endgültig löschen"
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const res = await deleteCutter(cutterId);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setOpen(false);
          router.push("/cutter");
        }}
      />
    </>
  );
}
