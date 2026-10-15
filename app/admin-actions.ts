"use server";

// Nutzerverwaltung: Kunden und Cutter anlegen, Einladungslinks, Profile, Freigaben.
// Fast alles hier dürfen nur Admins – Ausnahme: acceptInvite (die eingeladene Person selbst).

import { randomBytes, randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { refresh } from "next/cache";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/db";
import { account, cutterClients, invites, profiles, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

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

// Neuen Einladungslink erzeugen; ältere, noch offene Links derselben Person werden ungültig
async function issueInvite(userId: string, createdBy: string) {
  await db
    .update(invites)
    .set({ usedAt: new Date() })
    .where(and(eq(invites.userId, userId), isNull(invites.usedAt)));
  const token = randomBytes(24).toString("base64url");
  await db.insert(invites).values({
    token,
    userId,
    createdBy,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
  });
  return `${baseUrl()}/einladung/${token}`;
}

// ---------- Anlegen ----------

export async function createUserWithInvite(input: { name: string; email: string; role: "kunde" | "cutter"; phone?: string }) {
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
    refresh();
    return { userId: id, link };
  });
}

// Für vergessene Passwörter oder abgelaufene Einladungen: neuer Link
export async function regenerateInvite(userId: string) {
  return run(async () => {
    const me = await requireUser("admin");
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
    if (!u) throw new Error("Nutzer nicht gefunden.");
    const link = await issueInvite(userId, me.id);
    refresh();
    return { link };
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
    await db.update(invites).set({ usedAt: new Date() }).where(eq(invites.token, token));
    await db.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, u.id));

    // Direkt anmelden (setzt das Sitzungs-Cookie)
    await auth.api.signInEmail({ body: { email: u.email, password }, headers: await headers() });
    return null;
  });
}

// ---------- Profil & Freigaben ----------

export async function updateProfile(
  userId: string,
  input: { name: string; phone: string; links: string; notes: string; logo?: string | null },
) {
  return run(async () => {
    await requireUser("admin");
    const name = input.name.trim();
    if (!name) throw new Error("Der Name darf nicht leer sein.");
    // Logo: nur kleine Bilder als data-URL (wird im Browser vorher verkleinert)
    if (input.logo && (!input.logo.startsWith("data:image/") || input.logo.length > 200_000)) {
      throw new Error("Das Logo ist zu groß oder kein Bild.");
    }
    await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, userId));
    const values = {
      phone: input.phone.trim() || null,
      links: input.links.trim() || null,
      notes: input.notes.trim() || null,
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
