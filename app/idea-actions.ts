"use server";

// Projekt-Ideen: anlegen (Kunden), abhaken (Admins, der Kunde selbst, zugewiesene Cutter), löschen (Admins, der Kunde selbst)

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { projectIdeas } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { clientIdsOfCutter } from "@/lib/access";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Unbekannter Fehler" };
  }
}

type Me = Awaited<ReturnType<typeof requireUser>>;

// Darf diese Person die Idee sehen (und damit abhaken)? Kunde: eigene, Cutter: freigegebene Kunden, Admin: alle
async function canSeeIdea(me: Me, customerId: string) {
  if (me.role === "admin") return true;
  if (me.role === "kunde") return customerId === me.id;
  return (await clientIdsOfCutter(me.id)).includes(customerId);
}

async function getIdea(id: string) {
  const [idea] = await db.select().from(projectIdeas).where(eq(projectIdeas.id, id));
  if (!idea) throw new Error("Idee nicht gefunden.");
  return idea;
}

export async function createIdea(input: { title: string; note: string }) {
  return run(async () => {
    const me = await requireUser("kunde");
    const title = input.title.trim();
    const note = input.note.trim();
    if (!title) throw new Error("Bitte einen Titel eingeben.");
    if (title.length > 200) throw new Error("Der Titel ist zu lang (max. 200 Zeichen).");
    if (note.length > 5000) throw new Error("Die Notiz ist zu lang (max. 5000 Zeichen).");
    await db
      .insert(projectIdeas)
      .values({ id: randomUUID(), customerId: me.id, title, note: note || null, createdBy: me.id });
    refresh();
    return null;
  });
}

// Abhaken bzw. wieder öffnen
export async function setIdeaDone(id: string, done: boolean) {
  return run(async () => {
    const me = await requireUser();
    const idea = await getIdea(id);
    if (!(await canSeeIdea(me, idea.customerId))) throw new Error("Keine Berechtigung.");
    await db
      .update(projectIdeas)
      .set(done ? { doneAt: new Date(), doneBy: me.id } : { doneAt: null, doneBy: null })
      .where(eq(projectIdeas.id, id));
    refresh();
    return null;
  });
}

export async function deleteIdea(id: string) {
  return run(async () => {
    const me = await requireUser("kunde", "admin");
    const idea = await getIdea(id);
    if (me.role === "kunde" && idea.customerId !== me.id) throw new Error("Keine Berechtigung.");
    await db.delete(projectIdeas).where(eq(projectIdeas.id, id));
    refresh();
    return null;
  });
}
