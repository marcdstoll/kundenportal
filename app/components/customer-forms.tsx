"use client";

// Kunden (Firmen): Profil bearbeiten (Logo, Titelbild, Links, Infos) und Nutzer verwalten.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { inviteMember, removeMember, resendMemberInvite, setMemberAdmin, updateCustomer } from "@/app/admin-actions";
import { ConfirmDialog } from "./confirm-dialog";
import { SlideOver } from "./slide-over";
import { Avatar, buttonPrimary, buttonSecondary, inputField } from "./ui";

type Links = { tiktok: string; youtube: string; instagram: string; extra: { label: string; url: string }[] };

// Bild im Browser verkleinern (WebP, sonst JPEG) und als data-URL liefern
async function shrink(file: File, maxEdge: number, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={`text-sm ${msg.ok ? "text-[var(--st-online)]" : "text-danger"}`}>{msg.text}</p>;
}

// Feste Plattformen – weitere Links mit eigenem Namen lassen sich darunter ergänzen
export const FIXED_LINKS = [
  { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@…" },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/@…" },
  { key: "instagram", label: "Instagram", placeholder: "instagram.com/…" },
] as const;

// ---------- Kundenprofil (nur Agentur-Admins) ----------

export function CustomerForm({
  customer,
  logoUrl,
  coverUrl,
}: {
  customer: { id: string; name: string; notes: string | null; links: Links };
  logoUrl: string | null;
  coverUrl: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(customer.name);
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [links, setLinks] = useState<Links>(customer.links);
  const [logo, setLogo] = useState<string | null | undefined>(undefined); // undefined = unverändert
  const [cover, setCover] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const logoPreview = logo === undefined ? logoUrl : logo;
  const coverPreview = cover === undefined ? coverUrl : cover;

  const pick = async (file: File | undefined, edge: number, set: (v: string) => void) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMsg({ ok: false, text: "Bitte ein Bild auswählen." });
    try {
      set(await shrink(file, edge));
    } catch {
      setMsg({ ok: false, text: "Das Bild konnte nicht gelesen werden." });
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const res = await updateCustomer(customer.id, { name, notes, links, logo, cover });
        setBusy(false);
        if (!res.ok) return setMsg({ ok: false, text: res.error });
        setMsg({ ok: true, text: "Gespeichert ✓" });
        setLogo(undefined);
        setCover(undefined);
        router.refresh();
      }}
    >
      {/* Titelbild */}
      <div className="space-y-2">
        <span className="text-sm text-muted">Titelbild (Galerie und Detailansicht)</span>
        <div className="relative aspect-[16/7] overflow-hidden rounded-xl border border-line bg-raised">
          {coverPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- Vorschau bzw. Bild aus der eigenen API
            <img src={coverPreview} alt="Titelbild" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-muted">Noch kein Titelbild</div>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="cursor-pointer text-accent hover:underline">
            {coverPreview ? "Titelbild ändern" : "Titelbild hochladen"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0], 1600, (v) => setCover(v))}
            />
          </label>
          {coverPreview && (
            <button type="button" className="text-muted hover:text-danger" onClick={() => setCover(null)}>
              Entfernen
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name || "?"} id={customer.id} size="lg" logoUrl={logoPreview} />
        <div className="space-y-1 text-sm">
          <label className="cursor-pointer text-accent hover:underline">
            {logoPreview ? "Logo ändern" : "Logo hochladen"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0], 256, (v) => setLogo(v))}
            />
          </label>
          {logoPreview && (
            <button type="button" className="block text-xs text-muted hover:text-danger" onClick={() => setLogo(null)}>
              Logo entfernen
            </button>
          )}
        </div>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-muted">Name des Kunden</span>
        <input className={inputField} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </label>

      <LinksEditor links={links} onChange={setLinks} disabled={busy} />

      <label className="block space-y-1 text-sm">
        <span className="text-muted">Infos für die Cutter (Stil, Do&apos;s &amp; Don&apos;ts, Ansprechpartner …)</span>
        <textarea
          className={inputField}
          rows={6}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
        />
      </label>

      <div className="flex items-center justify-end gap-3">
        <Msg msg={msg} />
        <button className={buttonPrimary} disabled={busy}>
          {busy ? "Wird gespeichert …" : "Speichern"}
        </button>
      </div>
    </form>
  );
}

// Links: links die Bezeichnung, rechts der Link. TikTok/YouTube/Instagram fest, weitere frei
function LinksEditor({ links, onChange, disabled }: { links: Links; onChange: (l: Links) => void; disabled: boolean }) {
  const row = "grid grid-cols-[7rem_1fr] items-center gap-2 sm:grid-cols-[9rem_1fr]";
  return (
    <div className="space-y-2" data-testid="links-editor">
      <span className="text-sm text-muted">Links</span>
      {FIXED_LINKS.map((f) => (
        <label key={f.key} className={row}>
          <span className="text-sm">{f.label}</span>
          <input
            className={inputField}
            placeholder={f.placeholder}
            value={links[f.key]}
            disabled={disabled}
            aria-label={f.label}
            onChange={(e) => onChange({ ...links, [f.key]: e.target.value })}
          />
        </label>
      ))}
      {links.extra.map((x, i) => (
        <div key={i} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 sm:grid-cols-[9rem_1fr_auto]">
          <input
            className={inputField}
            placeholder="Bezeichnung"
            aria-label="Bezeichnung"
            value={x.label}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...links, extra: links.extra.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })
            }
          />
          <input
            className={inputField}
            placeholder="Link"
            aria-label="Link"
            value={x.url}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...links, extra: links.extra.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)) })
            }
          />
          <button
            type="button"
            aria-label="Link entfernen"
            className="px-2 text-muted hover:text-danger"
            disabled={disabled}
            onClick={() => onChange({ ...links, extra: links.extra.filter((_, j) => j !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm text-accent hover:underline"
        disabled={disabled}
        onClick={() => onChange({ ...links, extra: [...links.extra, { label: "", url: "" }] })}
      >
        + Weiteren Link hinzufügen
      </button>
    </div>
  );
}

// ---------- Nutzer eines Kunden ----------

export type MemberRow = { id: string; name: string; email: string; isAdmin: boolean; invited: boolean };

export function MembersPanel({
  customerId,
  members,
  canManage,
  meId,
  memberHref,
}: {
  customerId: string;
  members: MemberRow[];
  canManage: boolean;
  meId: string;
  memberHref?: string; // Agentur: Link zur Detailseite eines Nutzers ("…/USERID")
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [remove, setRemove] = useState<MemberRow | null>(null);
  const adminCount = members.filter((m) => m.isAdmin).length;

  async function act(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) {
    setBusy(id);
    setMsg(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Fehler" });
    if (okText) setMsg({ ok: true, text: okText });
    router.refresh();
  }

  return (
    <div className="space-y-3" data-testid="members">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5" data-testid="member-row">
            <Avatar name={m.name} id={m.id} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                {memberHref ? (
                  <Link href={memberHref.replace("USERID", m.id)} className="font-medium hover:underline">
                    {m.name}
                  </Link>
                ) : (
                  <span className="font-medium">{m.name}</span>
                )}
                {m.id === meId && <span className="text-xs text-muted">(du)</span>}
                {m.isAdmin && (
                  <span className="rounded bg-accent/15 px-1.5 py-px text-[11px] font-medium text-accent">Admin</span>
                )}
                {m.invited && (
                  <span className="rounded bg-[var(--st-ready_to_post)]/15 px-1.5 py-px text-[11px] text-[var(--st-ready_to_post)]">
                    eingeladen
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted">{m.email}</p>
            </div>
            {canManage && (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {m.isAdmin ? (
                  adminCount > 1 && (
                    <button
                      type="button"
                      disabled={!!busy}
                      className="text-muted hover:text-text"
                      onClick={() => act(m.id, () => setMemberAdmin(m.id, false))}
                    >
                      Admin entziehen
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={!!busy}
                    className="text-muted hover:text-text"
                    onClick={() => act(m.id, () => setMemberAdmin(m.id, true))}
                  >
                    Zum Admin machen
                  </button>
                )}
                <button
                  type="button"
                  disabled={!!busy}
                  className="text-muted hover:text-text"
                  onClick={() =>
                    act(
                      m.id,
                      () => resendMemberInvite(m.id),
                      m.invited ? `Einladung an ${m.email} verschickt ✓` : `Passwort-Link an ${m.email} verschickt ✓`,
                    )
                  }
                >
                  {m.invited ? "Einladung senden" : "Passwort-Link senden"}
                </button>
                {m.id !== meId && members.length > 1 && (
                  <button
                    type="button"
                    disabled={!!busy}
                    className="text-muted hover:text-danger"
                    onClick={() => setRemove(m)}
                  >
                    Entfernen
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <Msg msg={msg} />
      {canManage && <InviteMemberForm customerId={customerId} />}
      <ConfirmDialog
        open={!!remove}
        title="Nutzer entfernen?"
        message={
          <>
            Der Zugang von „<b className="text-text">{remove?.name}</b>“ wird gelöscht. Projekte, Kommentare und Dateien
            bleiben erhalten.
          </>
        }
        confirmLabel="Entfernen"
        busy={busy === remove?.id}
        onCancel={() => setRemove(null)}
        onConfirm={async () => {
          if (!remove) return;
          await act(remove.id, () => removeMember(remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}

function InviteMemberForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={buttonSecondary} onClick={() => setOpen(true)}>
          + Nutzer einladen
        </button>
        <Msg msg={open ? null : msg} />
      </div>
      <SlideOver open={open} title="Nutzer einladen" onClose={() => setOpen(false)} busy={busy}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            const res = await inviteMember(customerId, { name, email, isAdmin });
            setBusy(false);
            if (!res.ok) return setMsg({ ok: false, text: res.error });
            setMsg(
              res.data.mailError
                ? { ok: false, text: `${name} ist angelegt, aber die Mail kam nicht an: ${res.data.mailError}` }
                : { ok: true, text: `✓ Einladung an ${res.data.email} verschickt.` },
            );
            setName("");
            setEmail("");
            setIsAdmin(false);
            setOpen(false);
            router.refresh();
          }}
        >
          <div className="grid gap-2">
            <input
              className={inputField}
              placeholder="Name"
              aria-label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <input
              className={inputField}
              type="email"
              placeholder="E-Mail (Login)"
              aria-label="E-Mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} disabled={busy} />
            Admin (darf weitere Nutzer einladen und Admins ernennen)
          </label>
          <Msg msg={msg} />
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonSecondary} onClick={() => setOpen(false)} disabled={busy}>
              Abbrechen
            </button>
            <button className={buttonPrimary} disabled={busy}>
              {busy ? "Wird eingeladen …" : "Einladung senden"}
            </button>
          </div>
        </form>
      </SlideOver>
    </>
  );
}
