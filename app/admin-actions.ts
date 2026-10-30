"use server";

// Nutzerverwaltung: Kunden und Cutter anlegen, Einladungslinks, Profile, Freigaben.
// Fast alles hier dürfen nur Admins – Ausnahme: acceptInvite (die eingeladene Person selbst).

import { randomBytes, randomUUID } from "crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { refresh } from "next/cache";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { inviteMail, mailConfigured, testMail, trySendMail } from "@/lib/mail";
import { SETTING_KEYS, getSetting, onboardingVideoFor, setSetting } from "@/lib/settings";

import { account, customerMembers, customers, cutterClients, invites, jobs, profiles, user } from "@/db/schema";
import { activeJobsOnlyWith, memberIds } from "@/lib/queries";
import { FrameioError, createRootFolder, createUpload, deleteFile, deleteFolder } from "@/lib/frameio";

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
    // Kunden-Nutzer entstehen über createCustomer/inviteMember (sie gehören immer zu einem Kunden)
    if (input.role !== "cutter") throw new Error("Kunden bitte über „Neuer Kunde“ anlegen.");

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

// ---------- Freigaben ----------

// Cutter für einen Kunden freigeben bzw. Freigabe entziehen
export async function setAssignment(cutterId: string, clientId: string, on: boolean) {
  return run(async () => {
    await requireUser("admin");
    if (on) {
      await db.insert(cutterClients).values({ cutterId, clientId }).onConflictDoNothing();
    } else {
      await db
        .delete(cutterClients)
        .where(and(eq(cutterClients.cutterId, cutterId), eq(cutterClients.clientId, clientId)));
    }
    refresh();
    return null;
  });
}

// ---------- Einstellungen: Mail-Test ----------

export async function sendTestMail(toInput?: string) {
  return run(async () => {
    const me = await requireUser("admin");
    const to = toInput?.trim() || me.email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
    const mail = testMail(me.name);
    const res = await trySendMail(to, mail.subject, mail.html, mail.text);
    if (!res.ok) throw new Error(res.error);
    return { to };
  });
}

// ---------- Persönliches Begrüßungsvideo (Webcam-Aufnahme, liegt in Frame.io unter "Registrierung") ----------
// In profiles.welcomeVideo steht dann "frameio:<Datei-ID>" statt eines Links.

const WELCOME_PREFIX = "frameio:";
const WELCOME_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const WELCOME_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

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
    if (!input.size || input.size > WELCOME_MAX_BYTES) throw new Error("Das Video ist zu groß (max. 1 GB).");
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
    const [prof] = await db
      .select({ welcome: profiles.welcomeVideo })
      .from(profiles)
      .where(eq(profiles.userId, userId));
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
    const [prof] = await db
      .select({ welcome: profiles.welcomeVideo })
      .from(profiles)
      .where(eq(profiles.userId, userId));
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

// ---------- Onboarding-Videos (für alle neuen Kunden bzw. Cutter) – liegen ebenfalls in Frame.io ----------
// In den Einstellungen steht dann "frameio:<Datei-ID>". Ältere Einträge können noch ein Link (YouTube/Vimeo) sein.

const ONBOARDING_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const onboardingKey = (role: string) => {
  if (role === "kunde") return SETTING_KEYS.onboardingKunde;
  if (role === "cutter") return SETTING_KEYS.onboardingCutter;
  throw new Error("Unbekannte Rolle.");
};

export async function startOnboardingUpload(role: string, input: { size: number; type: string; name: string }) {
  return run(async () => {
    await requireUser("admin");
    onboardingKey(role);
    const ext = WELCOME_TYPES[input.type.split(";")[0].trim()];
    if (!ext) throw new Error("Bitte ein Video im Format MP4, MOV oder WebM auswählen.");
    if (!input.size || input.size > ONBOARDING_MAX_BYTES) throw new Error("Das Video ist zu groß (max. 2 GB).");
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "-");
    const name = `Onboarding ${role === "cutter" ? "Cutter" : "Kunden"} ${stamp}.${ext}`;
    let upload;
    try {
      upload = await createUpload(await welcomeFolderId(), name, input.size);
    } catch (e) {
      if (!(e instanceof FrameioError) || e.status !== 404) throw e;
      upload = await createUpload(await welcomeFolderId(true), name, input.size);
    }
    return { fileId: upload.fileId, mediaType: upload.mediaType, parts: upload.parts };
  });
}

// Upload fertig → als Onboarding-Video setzen (ein altes Video wird in Frame.io gelöscht)
export async function finishOnboardingUpload(role: string, fileId: string) {
  return run(async () => {
    await requireUser("admin");
    const key = onboardingKey(role);
    const old = await getSetting(key);
    await setSetting(key, `${WELCOME_PREFIX}${fileId}`);
    if (old?.startsWith(WELCOME_PREFIX)) {
      await deleteFile(old.slice(WELCOME_PREFIX.length)).catch((e) =>
        console.error("Altes Onboarding-Video konnte nicht gelöscht werden:", e),
      );
    }
    refresh();
    return null;
  });
}

export async function removeOnboardingVideo(role: string) {
  return run(async () => {
    await requireUser("admin");
    const key = onboardingKey(role);
    const old = await getSetting(key);
    await setSetting(key, null);
    if (old?.startsWith(WELCOME_PREFIX)) {
      await deleteFile(old.slice(WELCOME_PREFIX.length)).catch((e) =>
        console.error("Onboarding-Video konnte nicht gelöscht werden:", e),
      );
    }
    refresh();
    return null;
  });
}

// Kunden komplett löschen: Projektordner in Frame.io (inkl. Raw, Review, Online und aller Dateien),
// Begrüßungsvideos, alle Projekte, alle Nutzer des Kunden und den Kunden selbst.
export async function deleteCustomer(customerId: string) {
  return run(async () => {
    await requireUser("admin");
    const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
    if (!c) throw new Error("Kunde nicht gefunden.");

    const customerJobs = await db.select().from(jobs).where(eq(jobs.customerId, customerId));

    // 1. Frame.io: jeden Projektordner einmal löschen (Duplikate teilen sich ihn).
    //    Unterordner und Dateien verschwinden mit. Schlägt etwas fehl, wird abgebrochen –
    //    ein zweiter Versuch macht einfach weiter (schon gelöschte Ordner gelten als erledigt).
    const folderIds = new Set(customerJobs.map((j) => j.frameioFolderId).filter((id): id is string => !!id));
    for (const folderId of folderIds) {
      try {
        await deleteFolder(folderId);
      } catch (e) {
        console.error("Frame.io-Ordner konnte nicht gelöscht werden:", e);
        const code = e instanceof FrameioError ? ` (Fehler ${e.status})` : "";
        throw new Error(`Die Dateien konnten nicht gelöscht werden${code}. Bitte nochmal versuchen.`);
      }
    }

    // 2. Persönliche Begrüßungsvideos der Nutzer
    const members = await memberIds(customerId);
    for (const userId of members) await deleteWelcomeFile(userId);

    // 3. Datenbank: Projekte (Dateien, Kommentare, Inbox, Cutter-Zuordnung gehen mit), Nutzer (Login, Profil,
    //    Einladungen gehen mit), dann der Kunde (Freigaben, Ideen gehen mit)
    await db.delete(jobs).where(eq(jobs.customerId, customerId));
    if (members.length) await db.delete(user).where(inArray(user.id, members));
    await db.delete(customers).where(eq(customers.id, customerId));

    refresh();
    return { projects: customerJobs.length };
  });
}

async function deleteWelcomeFile(userId: string) {
  const [prof] = await db.select({ welcome: profiles.welcomeVideo }).from(profiles).where(eq(profiles.userId, userId));
  if (prof?.welcome?.startsWith("frameio:")) {
    await deleteFile(prof.welcome.slice("frameio:".length)).catch((e) => console.error(e));
  }
}

// ---------- Kunden (Firmen) und ihre Nutzer ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Wer darf die Nutzer dieses Kunden verwalten? Admins (Agentur) und die Admins des Kunden selbst
async function requireCustomerManager(customerId: string) {
  const me = await requireUser();
  if (me.role === "admin") return me;
  if (me.role === "kunde" && me.customerId === customerId && me.customerAdmin) return me;
  throw new Error("Keine Berechtigung.");
}

async function memberOf(userId: string) {
  const [m] = await db.select().from(customerMembers).where(eq(customerMembers.userId, userId));
  if (!m) throw new Error("Nutzer nicht gefunden.");
  return m;
}

// Neuen Kunden-Nutzer anlegen (Login + Profil + Zuordnung) und einladen
async function addMember(
  customerId: string,
  input: { name: string; email: string; isAdmin: boolean; phone?: string; deferMail?: boolean },
  by: string,
) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new Error("Bitte einen Namen eingeben.");
  if (!EMAIL_RE.test(email)) throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
  const [exists] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (exists) throw new Error("Diese E-Mail-Adresse ist bereits registriert.");
  const id = randomUUID();
  await db.insert(user).values({ id, name, email, emailVerified: false, role: "kunde", active: true });
  await db.insert(profiles).values({ userId: id, phone: input.phone?.trim() || null });
  await db.insert(customerMembers).values({ userId: id, customerId, isAdmin: input.isAdmin });
  const link = await issueInvite(id, by);
  // deferMail: Einladung erst später senden (z. B. nach dem Hochladen eines Begrüßungsvideos)
  if (input.deferMail) return { userId: id, email, mailError: null };
  const mail = await mailInvite(id, link);
  return { userId: id, email, mailError: mail.ok ? null : mail.error };
}

// Neuer Kunde (Firma) mit erstem Nutzer – der erste Nutzer ist immer Admin des Kunden
export async function createCustomer(input: {
  name: string;
  userName: string;
  email: string;
  phone?: string;
  deferMail?: boolean;
}) {
  return run(async () => {
    const me = await requireUser("admin");
    const name = input.name.trim();
    if (!name) throw new Error("Bitte einen Namen für den Kunden eingeben.");
    if (!EMAIL_RE.test(input.email.trim())) throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
    const [exists] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, input.email.trim().toLowerCase()));
    if (exists) throw new Error("Diese E-Mail-Adresse ist bereits registriert.");
    const customerId = randomUUID();
    await db.insert(customers).values({ id: customerId, name });
    try {
      const res = await addMember(
        customerId,
        {
          name: input.userName.trim() || name,
          email: input.email,
          isAdmin: true,
          phone: input.phone,
          deferMail: input.deferMail,
        },
        me.id,
      );
      refresh();
      return { customerId, ...res };
    } catch (e) {
      await db.delete(customers).where(eq(customers.id, customerId));
      throw e;
    }
  });
}

// Weiteren Nutzer zu einem Kunden einladen (Agentur-Admins und Admins des Kunden)
export async function inviteMember(customerId: string, input: { name: string; email: string; isAdmin: boolean }) {
  return run(async () => {
    const me = await requireCustomerManager(customerId);
    const res = await addMember(customerId, input, me.id);
    refresh();
    return res;
  });
}

// Admin-Recht innerhalb des Kunden vergeben bzw. entziehen (mindestens ein Admin bleibt)
export async function setMemberAdmin(userId: string, isAdmin: boolean) {
  return run(async () => {
    const m = await memberOf(userId);
    await requireCustomerManager(m.customerId);
    if (!isAdmin && m.isAdmin) {
      const admins = await db
        .select({ id: customerMembers.userId })
        .from(customerMembers)
        .where(and(eq(customerMembers.customerId, m.customerId), eq(customerMembers.isAdmin, true)));
      if (admins.length <= 1) throw new Error("Es muss mindestens ein Admin übrig bleiben.");
    }
    await db.update(customerMembers).set({ isAdmin }).where(eq(customerMembers.userId, userId));
    refresh();
    return null;
  });
}

// Nutzer aus einem Kunden entfernen (Zugang wird gelöscht; Projekte, Kommentare und Dateien bleiben)
export async function removeMember(userId: string) {
  return run(async () => {
    const m = await memberOf(userId);
    const me = await requireCustomerManager(m.customerId);
    if (me.id === userId) throw new Error("Du kannst dich nicht selbst entfernen.");
    const members = await db.select().from(customerMembers).where(eq(customerMembers.customerId, m.customerId));
    if (members.length <= 1)
      throw new Error("Der letzte Nutzer kann nicht entfernt werden – lösch stattdessen den Kunden.");
    if (m.isAdmin && members.filter((x) => x.isAdmin).length <= 1) {
      throw new Error("Es muss mindestens ein Admin übrig bleiben.");
    }
    await deleteWelcomeFile(userId);
    await db.delete(user).where(eq(user.id, userId));
    refresh();
    return null;
  });
}

// Einladung bzw. Passwort-Link erneut senden (Admins des Kunden für ihre Nutzer)
export async function resendMemberInvite(userId: string) {
  return run(async () => {
    const m = await memberOf(userId);
    const me = await requireCustomerManager(m.customerId);
    if (!mailConfigured()) throw new Error("E-Mail-Versand ist nicht eingerichtet.");
    const link = await issueInvite(userId, me.id);
    const mail = await mailInvite(userId, link);
    if (!mail.ok) throw new Error(mail.error);
    return { to: mail.to };
  });
}

// Persönliche Daten einer Person (Name, Telefon, Geburtstag, Bild) – einheitlich für „Mein Profil“,
// Cutter und Kunden-Nutzer. Erlaubt: die Person selbst, Admins, Admins des Kunden für ihre Nutzer.
export async function savePerson(
  userId: string,
  input: { name: string; phone: string; birthday: string; logo?: string | null },
) {
  return run(async () => {
    const me = await requireUser();
    if (me.id !== userId && me.role !== "admin") {
      const [m] = await db.select().from(customerMembers).where(eq(customerMembers.userId, userId));
      if (!m) throw new Error("Keine Berechtigung.");
      await requireCustomerManager(m.customerId);
    }
    const name = input.name.trim();
    if (!name) throw new Error("Der Name darf nicht leer sein.");
    if (name.length > 120) throw new Error("Der Name ist zu lang.");
    if (input.logo && (!input.logo.startsWith("data:image/") || input.logo.length > 200_000)) {
      throw new Error("Das Bild ist zu groß oder kein Bild.");
    }
    const birthday = input.birthday.trim() || null;
    if (birthday) {
      const d = new Date(`${birthday}T12:00:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || isNaN(d.getTime()) || d > new Date() || d.getFullYear() < 1900) {
        throw new Error("Bitte ein gültiges Geburtsdatum eingeben.");
      }
    }
    await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, userId));
    const values = {
      phone: input.phone.trim() || null,
      birthday,
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

// Passwort ändern: Link zum Neu-Festlegen an die eigene E-Mail-Adresse
export async function sendOwnPasswordLink() {
  return run(async () => {
    const me = await requireUser();
    if (!mailConfigured()) throw new Error("E-Mail-Versand ist nicht eingerichtet.");
    const link = await issueInvite(me.id, me.id);
    const mail = await mailInvite(me.id, link);
    if (!mail.ok) throw new Error(mail.error);
    return { to: mail.to };
  });
}

// Link: leer erlaubt; ohne http(s) wird https:// ergänzt
function cleanLink(value: string) {
  const v = value.trim();
  if (!v) return "";
  if (v.length > 500) throw new Error("Ein Link ist zu lang.");
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function checkImage(value: string | null | undefined, max: number, label: string) {
  if (value && (!value.startsWith("data:image/") || value.length > max)) {
    throw new Error(`${label} ist zu groß oder kein Bild.`);
  }
}

// Kundenprofil (nur Agentur-Admins): Name, Logo, Titelbild, Links, Infos für Cutter
export async function updateCustomer(
  customerId: string,
  input: {
    name: string;
    notes: string;
    links: { tiktok: string; youtube: string; instagram: string; extra: { label: string; url: string }[] };
    logo?: string | null;
    cover?: string | null;
  },
) {
  return run(async () => {
    await requireUser("admin");
    const name = input.name.trim();
    if (!name) throw new Error("Der Name darf nicht leer sein.");
    checkImage(input.logo, 200_000, "Das Logo");
    checkImage(input.cover, 2_000_000, "Das Titelbild");
    if (input.notes.length > 10000) throw new Error("Die Infos sind zu lang.");
    const extra = input.links.extra
      .map((e) => ({ label: e.label.trim().slice(0, 60), url: cleanLink(e.url) }))
      .filter((e) => e.url);
    if (extra.length > 30) throw new Error("Zu viele Links.");
    const linkList = JSON.stringify({
      tiktok: cleanLink(input.links.tiktok),
      youtube: cleanLink(input.links.youtube),
      instagram: cleanLink(input.links.instagram),
      extra: extra.map((e) => ({
        label: e.label || e.url.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0],
        url: e.url,
      })),
    });
    await db
      .update(customers)
      .set({
        name,
        notes: input.notes.trim() || null,
        linkList,
        ...(input.logo !== undefined ? { logo: input.logo } : {}),
        ...(input.cover !== undefined ? { cover: input.cover } : {}),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId));
    refresh();
    return null;
  });
}

// Banner der Kunden-Übersicht (nur Agentur-Admins, gesetzt in der Kundenansicht).
// image: data-URL, null = entfernen, undefined = unverändert · pos: senkrechte Bildposition 0–100 %
export async function setCustomerBanner(customerId: string, input: { image?: string | null; pos?: number }) {
  return run(async () => {
    await requireUser("admin");
    checkImage(input.image, 2_500_000, "Das Banner");
    const pos = input.pos === undefined ? undefined : Math.round(Math.min(100, Math.max(0, Number(input.pos) || 0)));
    const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
    if (!c) throw new Error("Kunde nicht gefunden.");
    if (input.image === undefined && pos === undefined) return null;
    await db
      .update(customers)
      .set({
        ...(input.image !== undefined ? { banner: input.image, updatedAt: new Date() } : {}),
        ...(pos !== undefined ? { bannerPos: pos } : {}),
      })
      .where(eq(customers.id, customerId));
    refresh();
    return null;
  });
}

// Farbe des Kunden (Board/Kalender): Agentur-Admins und Admins des Kunden
export async function setCustomerColor(customerId: string, color: string | null) {
  return run(async () => {
    await requireCustomerManager(customerId);
    if (color !== null && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Ungültige Farbe.");
    await db
      .update(customers)
      .set({ color: color?.toLowerCase() ?? null }) // updatedAt bleibt: steuert die Bild-Versionen
      .where(eq(customers.id, customerId));
    refresh();
    return null;
  });
}

// Cutter zum Admin machen bzw. einem Admin die Admin-Rechte entziehen (wird wieder Cutter) – nur Admins.
// Die eigene Rolle lässt sich nicht ändern, und es bleibt immer mindestens ein Admin.
// Freigegebene Kunden und Projekt-Zuordnungen bleiben gespeichert (als Cutter gelten sie wieder).
export async function setStaffRole(userId: string, role: "admin" | "cutter") {
  return run(async () => {
    const me = await requireUser("admin");
    if (role !== "admin" && role !== "cutter") throw new Error("Ungültige Rolle.");
    if (userId === me.id) throw new Error("Deine eigene Rolle kannst du nicht ändern.");
    const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId));
    if (!u || (u.role !== "admin" && u.role !== "cutter")) throw new Error("Person nicht gefunden.");
    if (u.role === role) return null;
    if (role === "cutter") {
      const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"));
      if (admins.length <= 1) throw new Error("Es muss mindestens ein Admin bleiben.");
    }
    await db.update(user).set({ role }).where(eq(user.id, userId));
    refresh();
    return null;
  });
}

// Cutter löschen: nur der Zugang und das Profil verschwinden.
// Projekte, Dateien (auch seine hochgeladenen Videos) und Kommentare bleiben – Cutter laden im Namen der Kunden hoch.
// Seine Projekte verlieren nur die Zuordnung zu ihm und können neu verteilt werden.
export async function deleteCutter(cutterId: string) {
  return run(async () => {
    const me = await requireUser("admin");
    const [u] = await db.select().from(user).where(eq(user.id, cutterId));
    if (!u || u.role !== "cutter") throw new Error("Cutter nicht gefunden.");
    if (u.id === me.id) throw new Error("Du kannst dich nicht selbst löschen.");

    const orphaned = await activeJobsOnlyWith(cutterId);

    // Persönliches Begrüßungsvideo gehört nur ihm → in Frame.io löschen
    const [prof] = await db
      .select({ welcome: profiles.welcomeVideo })
      .from(profiles)
      .where(eq(profiles.userId, cutterId));
    if (prof?.welcome?.startsWith("frameio:")) {
      await deleteFile(prof.welcome.slice("frameio:".length)).catch((e) => console.error(e));
    }

    // Person löschen: Login, Profil, Einladungen, Kunden-Freigaben und Projekt-Zuordnungen gehen automatisch mit.
    // Kommentare bleiben (Verfasser wird leer → „Gelöschter Nutzer“), Dateien bleiben unverändert.
    await db.delete(user).where(eq(user.id, cutterId));

    refresh();
    return { withoutCutter: orphaned };
  });
}
