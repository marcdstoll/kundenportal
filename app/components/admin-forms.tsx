"use client";

// Formulare der Nutzerverwaltung (nur Admins). Die Logik liegt in app/admin-actions.ts.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithInvite,
  regenerateInvite,
  removeWelcomeVideo,
  setAssignment,
  createCustomer,
  deleteCustomer,
  deleteCutter,
  setStaffRole,
} from "@/app/admin-actions";
import { uploadWelcomeVideo } from "@/lib/upload";
import { buttonPrimary, buttonSecondary, inputField } from "./ui";
import { MultiSelect } from "./multi-select";
import { WelcomePlayer, WelcomeRecorder } from "./welcome-recorder";
import { ConfirmDialog } from "./confirm-dialog";
import { SlideOver } from "./slide-over";

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
  const [firm, setFirm] = useState(""); // nur Kunden: Name des Kunden (Firma/Marke), sonst wie die Person
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

  const close = () => {
    dropVideo();
    setRecording(false);
    setError(null);
    setOpen(false);
  };

  return (
    <>
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
      <SlideOver open={open} title={label} onClose={close} busy={busy}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const res =
              role === "kunde"
                ? await createCustomer({ name: firm.trim() || name, userName: name, email, phone, deferMail: !!video })
                : await createUserWithInvite({ name, email, phone, role, deferMail: !!video });
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
            setFirm("");
            setEmail("");
            setPhone("");
            setOpen(false);
            router.refresh();
          }}
        >
          {role === "kunde" && (
            <div className="space-y-1">
              <input
                className={inputField}
                placeholder="Kunde"
                value={firm}
                onChange={(e) => setFirm(e.target.value)}
                disabled={busy}
              />
              <p className="text-xs text-muted">Erster Nutzer – wird automatisch Admin des Kunden:</p>
            </div>
          )}
          <div className="grid gap-2">
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
            <button type="button" className={buttonSecondary} onClick={close} disabled={busy}>
              Abbrechen
            </button>
            <button className={buttonPrimary} disabled={busy || recording}>
              {busy
                ? progress !== null
                  ? "Video wird hochgeladen …"
                  : "Wird angelegt …"
                : "Anlegen & Einladung senden"}
            </button>
          </div>
        </form>
      </SlideOver>
    </>
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
  const [fileKey, setFileKey] = useState(0);

  // Aufnahme oder hochgeladene Datei zu Frame.io schicken und der Person zuordnen
  async function save(video: Blob) {
    setMsg(null);
    setProgress(0);
    try {
      await uploadWelcomeVideo(userId, video, setProgress);
      setMsg({ ok: true, text: "✓ Gespeichert. Es wird beim Öffnen der Einladung gezeigt." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Upload fehlgeschlagen." });
    }
    setProgress(null);
  }

  if (recording) {
    return (
      <WelcomeRecorder
        acceptLabel="Video speichern"
        onCancel={() => setRecording(false)}
        onAccept={async (blob) => {
          setRecording(false);
          await save(blob);
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
          {/* Alternativ eine fertige Videodatei hochladen (landet ebenfalls in Frame.io) */}
          <label className={`${buttonSecondary} cursor-pointer`}>
            {hasVideo ? "Datei ersetzen" : "Datei hochladen"}
            <input
              key={fileKey}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setFileKey((k) => k + 1);
                if (file) save(file);
              }}
            />
          </label>
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

// Rolle wechseln: Cutter → Admin bzw. Admin → Cutter (nicht für die eigene Person)
export function StaffRoleToggle({ userId, name, role }: { userId: string; name: string; role: "admin" | "cutter" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toAdmin = role === "cutter";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={toAdmin ? buttonPrimary : buttonSecondary}
      >
        {toAdmin ? "Zum Admin machen" : "Admin-Rechte entziehen"}
      </button>
      <ConfirmDialog
        open={open}
        title={toAdmin ? "Zum Admin machen?" : "Admin-Rechte entziehen?"}
        message={
          toAdmin ? (
            <>
              „<b className="text-text">{name}</b>“ sieht danach alle Kunden und Projekte und kann Nutzer, Kunden und
              Einstellungen verwalten.
            </>
          ) : (
            <>
              „<b className="text-text">{name}</b>“ ist danach wieder Cutter und sieht nur noch die freigegebenen
              Kunden und die eigenen Projekte.
            </>
          )
        }
        confirmLabel={toAdmin ? "Zum Admin machen" : "Rechte entziehen"}
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const res = await setStaffRole(userId, toAdmin ? "admin" : "cutter");
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
