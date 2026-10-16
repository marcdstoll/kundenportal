"use client";

// Formulare der Nutzerverwaltung (nur Admins). Die Logik liegt in app/admin-actions.ts.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithInvite, regenerateInvite, setAssignment, updateProfile } from "@/app/admin-actions";
import { Avatar, buttonPrimary, buttonSecondary, inputField } from "./ui";
import { MultiSelect } from "./multi-select";

function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-danger">{error}</p> : null;
}

// Link anzeigen + kopieren (zum Weitergeben per WhatsApp, Mail …)
// mail: "sent" = per Mail verschickt, "off" = Versand nicht eingerichtet, "failed" = Versand fehlgeschlagen
export function InviteLinkBox({
  link,
  name,
  mail,
}: {
  link: string;
  name?: string;
  mail?: "sent" | "off" | "failed" | "skipped";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="space-y-2 rounded-lg border p-3 text-sm"
      style={{ borderColor: "var(--st-online)", background: "color-mix(in oklab, var(--st-online) 8%, transparent)" }}
    >
      <p className="font-medium">Einladungslink{name ? ` für ${name}` : ""} – 7 Tage gültig</p>
      {mail === "sent" && (
        <p className="text-sm">✉️ Per E-Mail verschickt. Zur Sicherheit kannst du den Link auch selbst weitergeben.</p>
      )}
      {mail === "off" && (
        <p className="text-sm">
          E-Mail-Versand ist noch nicht eingerichtet – bitte den Link selbst weitergeben (z. B. WhatsApp).
        </p>
      )}
      {mail === "failed" && (
        <p className="text-sm text-danger">
          Die E-Mail konnte nicht verschickt werden – bitte den Link selbst weitergeben.
        </p>
      )}
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          className={`${inputField} font-mono text-xs`}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Einladungslink"
        />
        <button
          type="button"
          className={`${buttonPrimary} shrink-0`}
          onClick={async () => {
            await navigator.clipboard.writeText(link).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Kopiert ✓" : "Kopieren"}
        </button>
      </div>
    </div>
  );
}

// ---------- Neuer Kunde / neuer Cutter ----------

export function NewUserForm({ role }: { role: "kunde" | "cutter" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [result, setResult] = useState<{
    link: string;
    name: string;
    mail: "sent" | "off" | "failed" | "skipped";
  } | null>(null);
  const label = role === "kunde" ? "Neuer Kunde" : "Neuer Cutter";

  if (!open && !result) {
    return (
      <button type="button" className={buttonPrimary} onClick={() => setOpen(true)}>
        + {label}
      </button>
    );
  }

  if (result) {
    return (
      <div className="w-full max-w-xl space-y-2">
        <InviteLinkBox link={result.link} name={result.name} mail={result.mail} />
        <button
          type="button"
          className={buttonSecondary}
          onClick={() => {
            setResult(null);
            setOpen(false);
          }}
        >
          Fertig
        </button>
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
        const res = await createUserWithInvite({ name, email, phone, role, sendEmail });
        setBusy(false);
        if (!res.ok) return setError(res.error);
        const d = res.data;
        setResult({
          link: d.link,
          name,
          mail: !sendEmail ? "skipped" : d.mailed ? "sent" : d.mailConfigured ? "failed" : "off",
        });
        setName("");
        setEmail("");
        setPhone("");
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
      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          className="size-4 accent-[var(--accent)]"
          checked={sendEmail}
          onChange={(e) => setSendEmail(e.target.checked)}
        />
        Einladung per E-Mail schicken
      </label>
      <ErrorText error={error} />
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonSecondary} onClick={() => setOpen(false)} disabled={busy}>
          Abbrechen
        </button>
        <button className={buttonPrimary} disabled={busy}>
          Anlegen & Link erzeugen
        </button>
      </div>
    </form>
  );
}

export function RegenerateInvite({ userId, invited }: { userId: string; invited: boolean }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [mail, setMail] = useState<"sent" | "off" | "failed">("off");
  const [error, setError] = useState<string | null>(null);
  if (link) return <InviteLinkBox link={link} mail={mail} />;
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={buttonSecondary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await regenerateInvite(userId);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setMail(res.data.mailed ? "sent" : res.data.mailConfigured ? "failed" : "off");
          setLink(res.data.link);
        }}
      >
        {invited ? "Neuen Einladungslink erzeugen" : "Link zum Passwort-Zurücksetzen erzeugen"}
      </button>
      <ErrorText error={error} />
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
  };
  logoUrl: string | null;
  showNotes: boolean;
}) {
  const [name, setName] = useState(person.name);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [links, setLinks] = useState(person.links ?? "");
  const [notes, setNotes] = useState(person.notes ?? "");
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
        const res = await updateProfile(person.id, { name, phone, links, notes, logo });
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
