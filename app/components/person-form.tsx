"use client";

// Persönliche Daten – einheitlich für „Mein Profil“, Cutter und Kunden-Nutzer
import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePerson, sendOwnPasswordLink } from "@/app/admin-actions";
import { Avatar, buttonPrimary, buttonSecondary, inputField } from "./ui";

// Bild im Browser auf max. 256 px verkleinern (klein genug für die Datenbank)
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

export function PersonForm({
  person,
  logoUrl,
}: {
  person: { id: string; name: string; email: string; phone: string | null; birthday: string | null };
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(person.name);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [birthday, setBirthday] = useState(person.birthday ?? "");
  // undefined = Bild nicht geändert, null = entfernen, string = neues Bild
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const preview = logo === undefined ? logoUrl : logo;

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const res = await savePerson(person.id, { name, phone, birthday, logo });
        setBusy(false);
        if (!res.ok) return setMsg({ ok: false, text: res.error });
        setMsg({ ok: true, text: "Gespeichert ✓" });
        setLogo(undefined);
        router.refresh();
      }}
    >
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} id={person.id} size="lg" logoUrl={preview} />
        <div className="space-y-1 text-sm">
          <label className="cursor-pointer text-accent hover:underline">
            {preview ? "Bild ändern" : "Bild hochladen"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  setLogo(await shrinkImage(f));
                } catch {
                  setMsg({ ok: false, text: "Das Bild konnte nicht gelesen werden." });
                }
              }}
            />
          </label>
          {preview && (
            <button type="button" className="block text-xs text-muted hover:text-danger" onClick={() => setLogo(null)}>
              Bild entfernen
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted">Name</span>
          <input className={inputField} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">E-Mail (Login)</span>
          <input className={`${inputField} text-muted`} value={person.email} readOnly aria-readonly />
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

      <div className="flex items-center justify-end gap-3">
        {msg && <p className={`text-sm ${msg.ok ? "text-[var(--st-online)]" : "text-danger"}`}>{msg.text}</p>}
        <button className={buttonPrimary} disabled={busy}>
          {busy ? "Wird gespeichert …" : "Speichern"}
        </button>
      </div>
    </form>
  );
}

// „Passwort ändern“ für sich selbst: Link per E-Mail
export function OwnPasswordButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={buttonSecondary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const res = await sendOwnPasswordLink();
          setBusy(false);
          setMsg(res.ok ? { ok: true, text: `✓ Link an ${res.data.to} verschickt.` } : { ok: false, text: res.error });
        }}
      >
        {busy ? "Wird gesendet …" : "Link zum Passwort-Ändern senden"}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-[var(--st-online)]" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
