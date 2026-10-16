"use server";

// Nutzerverwaltung: Kunden und Cutter anlegen, Einladungslinks, Profile, Freigaben.
// Fast alles hier dürfen nur Admins – Ausnahme: acceptInvite (die eingeladene Person selbst).

import { randomBytes, randomUUID } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { refresh } from "next/cache";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/db";
import { account, cutterClients, invites, profiles, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { inviteMail, mailConfigured, trySendMail } from "@/lib/mail";
import { SETTING_KEYS, getSetting, onboardingVideoFor, setSetting } from "@/lib/settings";
import { FrameioError, createRootFolder, createUpload, deleteFile } from "@/lib/frameio";

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Unbekannter Fehler" };
  }
}

const INVITE_DAYS = 7;

function baseUrl() {
  return (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
}

// Einladungslink holen: Ein noch offener, gültiger Link wird wiederverwendet (und verlängert),
// damit auch ältere Mails weiter funktionieren, wenn man die Einladung mehrfach schickt.
async function issueInvite(userId: string, createdBy: string) {
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  const [open] = await db
    .select({ token: invites.token })
    .from(invites)
    .where(and(eq(invites.userId, userId), isNull(invites.usedAt), gt(invites.expiresAt, new Date())));
  if (open) {
    await db.update(invites).set({ expiresAt }).where(eq(invites.token, open.token));
    return `${baseUrl()}/einladung/${open.token}`;
  }
  const token = randomBytes(24).toString("base64url");
  await db.insert(invites).values({ token, userId, createdBy, expiresAt });
  return `${baseUrl()}/einladung/${token}`;
}

// Einladung bzw. Passwort-Link per Mail verschicken
async function mailInvite(userId: string, link: string) {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u) return { ok: false as const, error: "Nutzer nicht gefunden." };
  const [acc] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
  const [prof] = await db.select({ welcome: profiles.welcomeVideo }).from(profiles).where(eq(profiles.userId, userId));
  const personal = !!prof?.welcome;
  const hasVideos = personal || !!(await onboardingVideoFor(u.role ?? "kunde"));
  const mail = inviteMail({ name: u.name, link, role: u.role ?? "kunde", reset: !!acc, hasVideos, personal });
  const res = await trySendMail(u.email, mail.subject, mail.html, mail.text);
  return res.ok ? { ok: true as const, to: u.email } : { ok: false as const, error: res.error };
}

// ---------- Anlegen ----------

export async function createUserWithInvite(input: {
  name: string;
  email: string;
  role: "kunde" | "cutter";
  phone?: string;
  // true: Einladung noch nicht senden (z. B. weil erst das Begrüßungsvideo hochgeladen wird)
  deferMail?: boolean;
}) {
  return run(async () => {
    const me = await requireUser("admin");
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name) throw new Error("Bitte einen Namen eingeben.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
    if (!["kunde", "cutter"].includes(input.role)) throw new Error("Unbekannte Rolle.");

    const [exists] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (exists) throw new Error("Diese E-Mail-Adresse ist bereits registriert.");

    const id = randomUUID();
    await db.insert(user).values({ id, name, email, emailVerified: false, role: input.role, active: true });
    await db.insert(profiles).values({ userId: id, phone: input.phone?.trim() || null });
    const link = await issueInvite(id, me.id);
    if (input.deferMail) {
      refresh();
      return { userId: id, email, mailError: null };
    }
    const mail = await mailInvite(id, link);
    refresh();
    // Person ist angelegt; klappt die Mail nicht, kann sie in der Detailansicht erneut gesendet werden
    return { userId: id, email, mailError: mail.ok ? null : mail.error };
  });
}

// Einladung bzw. Link zum Passwort-Zurücksetzen per Mail (beliebig oft)
export async function regenerateInvite(userId: string) {
  return run(async () => {
    const me = await requireUser("admin");
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
    if (!u) throw new Error("Nutzer nicht gefunden.");
    if (!mailConfigured()) throw new Error("E-Mail-Versand ist nicht eingerichtet.");
    const link = await issueInvite(userId, me.id);
    const mail = await mailInvite(userId, link);
    if (!mail.ok) throw new Error(mail.error);
    return { to: mail.to };
  });
}

// ---------- Einladung annehmen (öffentlich, über den Link) ----------

export async function acceptInvite(token: string, password: string) {
  return run(async () => {
    const [inv] = await db.select().from(invites).where(eq(invites.token, token));
    if (!inv || inv.usedAt) throw new Error("Dieser Link wurde schon benutzt oder ist ungültig.");
    if (inv.expiresAt < new Date()) throw new Error("Dieser Link ist abgelaufen. Bitte frag nach einem neuen.");
    if (password.length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen haben.");

    const [u] = await db.select().from(user).where(eq(user.id, inv.userId));
    if (!u) throw new Error("Nutzer nicht gefunden.");

    // Passwort speichern (gleiches Verfahren wie Better Auth beim Registrieren)
    const hash = await hashPassword(password);
    const [existing] = await db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")));
    if (existing) {
      await db.update(account).set({ password: hash, updatedAt: new Date() }).where(eq(account.id, existing.id));
    } else {
      await db.insert(account).values({
        id: randomUUID(),
        accountId: u.id,
        providerId: "credential",
        userId: u.id,
        password: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    // Dieser und alle anderen offenen Links der Person werden damit ungültig
    await db
      .update(invites)
      .set({ usedAt: new Date() })
      .where(and(eq(invites.userId, u.id), isNull(invites.usedAt)));
    await db.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, u.id));

    // Direkt anmelden (setzt das Sitzungs-Cookie)
    await auth.api.signInEmail({ body: { email: u.email, password }, headers: await headers() });
    return null;
  });
}

// Link prüfen: leer erlaubt, sonst http(s)
function checkUrl(value: string) {
  const v = value.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) throw new Error("Video-Links müssen mit http:// oder https:// beginnen.");
  return v;
}

// ---------- Profil & Freigaben ----------

export async function updateProfile(
  userId: string,
  input: {
    name: string;
    phone: string;
    links: string;
    notes: string;
    birthday?: string;
    welcomeVideo?: string;
    logo?: string | null;
  },
) {
  return run(async () => {
    await requireUser("admin");
    const name = input.name.trim();
    if (!name) throw new Error("Der Name darf nicht leer sein.");
    // Logo: nur kleine Bilder als data-URL (wird im Browser vorher verkleinert)
    if (input.logo && (!input.logo.startsWith("data:image/") || input.logo.length > 200_000)) {
      throw new Error("Das Logo ist zu groß oder kein Bild.");
    }
    // Geburtstag: leer = entfernen, sonst echtes Datum in der Vergangenheit
    const birthday = input.birthday?.trim() || null;
    if (birthday) {
      const d = new Date(`${birthday}T12:00:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || isNaN(d.getTime()) || d > new Date() || d.getFullYear() < 1900) {
        throw new Error("Bitte ein gültiges Geburtsdatum eingeben.");
      }
    }
    await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, userId));
    const values = {
      phone: input.phone.trim() || null,
      links: input.links.trim() || null,
      notes: input.notes.trim() || null,
      ...(input.birthday !== undefined ? { birthday } : {}),
      ...(input.welcomeVideo !== undefined ? { welcomeVideo: checkUrl(input.welcomeVideo) } : {}),
      ...(input.logo !== undefined ? { logo: input.logo } : {}),
      updatedAt: new Date(),
    };
    await db
      .insert(profiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: profiles.userId, set: values });
    refresh();
    return null;
  });
}

// Cutter für einen Kunden freigeben bzw. Freigabe entziehen
export async function setAssignment(cutterId: string, clientId: string, on: boolean) {
  return run(async () => {
    await requireUser("admin");
    if (on) {
      await db.insert(cutterClients).values({ cutterId, clientId }).onConflictDoNothing();
    } else {
      await db.delete(cutterClients).where(and(eq(cutterClients.cutterId, cutterId), eq(cutterClients.clientId, clientId)));
    }
    refresh();
    return null;
  });
}

// ---------- Einstellungen: Onboarding-Videos & Mail-Test ----------

export async function saveOnboardingVideos(input: { kunde: string; cutter: string }) {
  return run(async () => {
    await requireUser("admin");
    await setSetting(SETTING_KEYS.onboardingKunde, checkUrl(input.kunde));
    await setSetting(SETTING_KEYS.onboardingCutter, checkUrl(input.cutter));
    refresh();
    return null;
  });
}

export async function sendTestMail(toInput?: string) {
  return run(async () => {
    const me = await requireUser("admin");
    const to = toInput?.trim() || me.email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
    const res = await trySendMail(
      to,
      "Testmail aus dem Contenthaus-Portal",
      "<p>Wenn du das liest, funktioniert der Mailversand. 🎉</p>",
      "Wenn du das liest, funktioniert der Mailversand.",
    );
    if (!res.ok) throw new Error(res.error);
    return { to };
  });
}

// ---------- Persönliches Begrüßungsvideo (Webcam-Aufnahme, liegt in Frame.io unter "Registrierung") ----------
// In profiles.welcomeVideo steht dann "frameio:<Datei-ID>" statt eines Links.

const WELCOME_PREFIX = "frameio:";
const WELCOME_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const WELCOME_MAX_BYTES = 300 * 1024 * 1024;

async function welcomeFolderId(fresh = false) {
  if (!fresh) {
    const cached = await getSetting(SETTING_KEYS.welcomeFolder);
    if (cached) return cached;
  }
  const folder = await createRootFolder("Registrierung");
  await setSetting(SETTING_KEYS.welcomeFolder, folder.id);
  return folder.id;
}

// Schritt 1: Upload-Links für die Aufnahme holen (der Browser lädt direkt zu Frame.io hoch)
export async function startWelcomeUpload(userId: string, input: { size: number; type: string }) {
  return run(async () => {
    await requireUser("admin");
    const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
    if (!u) throw new Error("Nutzer nicht gefunden.");
    const ext = WELCOME_TYPES[input.type.split(";")[0].trim()];
    if (!ext) throw new Error("Dieses Videoformat wird nicht unterstützt.");
    if (!input.size || input.size > WELCOME_MAX_BYTES) throw new Error("Das Video ist zu groß (max. 300 MB).");
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "-");
    const name = `${u.name.replace(/[\\/:*?"<>|]/g, "")} – Begrüßung ${stamp}.${ext}`;
    let upload;
    try {
      upload = await createUpload(await welcomeFolderId(), name, input.size);
    } catch (e) {
      // Ordner wurde in Frame.io gelöscht → neu anlegen und nochmal versuchen
      if (!(e instanceof FrameioError) || e.status !== 404) throw e;
      upload = await createUpload(await welcomeFolderId(true), name, input.size);
    }
    return { fileId: upload.fileId, mediaType: upload.mediaType, parts: upload.parts };
  });
}

// Schritt 2: Upload fertig → Video der Person zuordnen (ein altes Video wird in Frame.io gelöscht)
export async function finishWelcomeUpload(userId: string, fileId: string) {
  return run(async () => {
    await requireUser("admin");
    const [prof] = await db.select({ welcome: profiles.welcomeVideo }).from(profiles).where(eq(profiles.userId, userId));
    const value = `${WELCOME_PREFIX}${fileId}`;
    await db
      .insert(profiles)
      .values({ userId, welcomeVideo: value })
      .onConflictDoUpdate({ target: profiles.userId, set: { welcomeVideo: value, updatedAt: new Date() } });
    if (prof?.welcome?.startsWith(WELCOME_PREFIX)) {
      await deleteFile(prof.welcome.slice(WELCOME_PREFIX.length)).catch((e) =>
        console.error("Altes Begrüßungsvideo konnte nicht gelöscht werden:", e),
      );
    }
    refresh();
    return null;
  });
}

export async function removeWelcomeVideo(userId: string) {
  return run(async () => {
    await requireUser("admin");
    const [prof] = await db.select({ welcome: profiles.welcomeVideo }).from(profiles).where(eq(profiles.userId, userId));
    await db.update(profiles).set({ welcomeVideo: null, updatedAt: new Date() }).where(eq(profiles.userId, userId));
    if (prof?.welcome?.startsWith(WELCOME_PREFIX)) {
      await deleteFile(prof.welcome.slice(WELCOME_PREFIX.length)).catch((e) =>
        console.error("Begrüßungsvideo konnte nicht gelöscht werden:", e),
      );
    }
    refresh();
    return null;
  });
}
