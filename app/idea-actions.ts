"use server";

// Projekt-Ideen – aufgebaut wie das Featureboard, aber je Kunde:
// sehen dürfen der Kunde selbst, die für ihn freigegebenen Cutter und Admins.
// - anlegen: Kunde (für sich) und Team (für einen Kunden)
// - upvoten, Priorität setzen, kommentieren, Screenshots hinzufügen: alle, die die Idee sehen
// - Status setzen: Admins und Cutter
// - Idee/Screenshots löschen: Kunde, Ersteller, Admins · Kommentar bearbeiten: Verfasser · löschen: Verfasser, Admins

import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import {
  customers,
  cutterClients,
  ideaAttachments,
  ideaComments,
  ideaVotes,
  notifications,
  projectIdeas,
  user,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { canSeeIdea } from "@/lib/access";
import { memberIds } from "@/lib/queries";
import { IDEA_STATUSES, IDEA_STATUS_LABELS, PRIORITIES } from "@/lib/ideas";

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

async function getIdea(id: string) {
  const [idea] = await db.select().from(projectIdeas).where(eq(projectIdeas.id, id));
  if (!idea) throw new Error("Idee nicht gefunden.");
  return idea;
}

async function getVisibleIdea(me: Me, id: string) {
  const idea = await getIdea(id);
  if (!(await canSeeIdea(me, idea.customerId))) throw new Error("Keine Berechtigung.");
  return idea;
}

// Verwalten (löschen, Screenshots entfernen): Admins, Nutzer des Kunden, Ersteller
const canManage = (me: Me, idea: { customerId: string; createdBy: string | null }) =>
  me.role === "admin" || me.customerId === idea.customerId || me.id === idea.createdBy;

// Alle, die eine Idee dieses Kunden sehen: Kunde, freigegebene Cutter, Admins
async function participants(customerId: string) {
  const [members, cutters, admins] = await Promise.all([
    memberIds(customerId),
    db.select({ id: cutterClients.cutterId }).from(cutterClients).where(eq(cutterClients.clientId, customerId)),
    db.select({ id: user.id }).from(user).where(eq(user.role, "admin")),
  ]);
  return [...members, ...cutters.map((c) => c.id), ...admins.map((a) => a.id)];
}

async function notifyIdea(ideaId: string, actorId: string, to: (string | null)[], type: string, text: string) {
  const ids = [...new Set(to.filter((id): id is string => !!id && id !== actorId))];
  if (ids.length === 0) return;
  await db
    .insert(notifications)
    .values(ids.map((userId) => ({ id: randomUUID(), userId, ideaId, type, text, actorId })));
}

const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)} …` : s);

// ---------- Ideen ----------

export async function createIdea(input: { title: string; description: string; priority: string; customerId?: string }) {
  return run(async () => {
    const me = await requireUser();
    const customerId = me.role === "kunde" ? (me.customerId ?? "") : (input.customerId ?? "");
    if (!customerId) throw new Error("Bitte einen Kunden auswählen.");
    const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
    if (!customer) throw new Error("Kunde nicht gefunden.");
    if (!(await canSeeIdea(me, customerId))) throw new Error("Keine Berechtigung.");
    const title = input.title.trim();
    const description = input.description.trim();
    if (!title) throw new Error("Bitte einen Titel eingeben.");
    if (title.length > 200) throw new Error("Der Titel ist zu lang (max. 200 Zeichen).");
    if (description.length > 5000) throw new Error("Die Beschreibung ist zu lang (max. 5000 Zeichen).");
    const priority = (PRIORITIES as readonly string[]).includes(input.priority) ? input.priority : "mittel";
    const id = randomUUID();
    await db
      .insert(projectIdeas)
      .values({ id, customerId, title, note: description || null, priority, createdBy: me.id });
    await notifyIdea(
      id,
      me.id,
      await participants(customerId),
      "idea",
      `Neue Projekt-Idee von ${me.name}: „${short(title)}“`,
    );
    refresh();
    return { id };
  });
}

export async function deleteIdea(id: string) {
  return run(async () => {
    const me = await requireUser();
    const idea = await getVisibleIdea(me, id);
    if (!canManage(me, idea)) throw new Error("Keine Berechtigung.");
    await db.delete(projectIdeas).where(eq(projectIdeas.id, id));
    refresh();
    return null;
  });
}

export async function toggleIdeaVote(ideaId: string) {
  return run(async () => {
    const me = await requireUser();
    await getVisibleIdea(me, ideaId);
    const removed = await db
      .delete(ideaVotes)
      .where(and(eq(ideaVotes.ideaId, ideaId), eq(ideaVotes.userId, me.id)))
      .returning({ id: ideaVotes.ideaId });
    if (removed.length === 0) await db.insert(ideaVotes).values({ ideaId, userId: me.id }).onConflictDoNothing();
    refresh();
    return { voted: removed.length === 0 };
  });
}

// Status: nur Admins und Cutter
export async function setIdeaStatus(ideaId: string, status: string) {
  return run(async () => {
    const me = await requireUser("admin", "cutter");
    if (!(IDEA_STATUSES as readonly string[]).includes(status)) throw new Error("Unbekannter Status.");
    const idea = await getVisibleIdea(me, ideaId);
    if (idea.status === status) return null;
    const done = status === "abgeschlossen";
    await db
      .update(projectIdeas)
      .set({ status, doneAt: done ? new Date() : null, doneBy: done ? me.id : null })
      .where(eq(projectIdeas.id, ideaId));
    await notifyIdea(
      ideaId,
      me.id,
      [...(await memberIds(idea.customerId)), idea.createdBy],
      "idea_status",
      `„${short(idea.title)}“ ist jetzt: ${IDEA_STATUS_LABELS[status]}`,
    );
    refresh();
    return null;
  });
}

// Priorität: alle, die die Idee sehen
export async function setIdeaPriority(ideaId: string, priority: string) {
  return run(async () => {
    const me = await requireUser();
    if (!(PRIORITIES as readonly string[]).includes(priority)) throw new Error("Unbekannte Priorität.");
    await getVisibleIdea(me, ideaId);
    await db.update(projectIdeas).set({ priority }).where(eq(projectIdeas.id, ideaId));
    refresh();
    return null;
  });
}

export async function deleteIdeaImage(imageId: string) {
  return run(async () => {
    const me = await requireUser();
    const [img] = await db
      .select({ ideaId: ideaAttachments.ideaId })
      .from(ideaAttachments)
      .where(eq(ideaAttachments.id, imageId));
    if (!img) throw new Error("Screenshot nicht gefunden.");
    const idea = await getVisibleIdea(me, img.ideaId);
    if (!canManage(me, idea)) throw new Error("Keine Berechtigung.");
    await db.delete(ideaAttachments).where(eq(ideaAttachments.id, imageId));
    refresh();
    return null;
  });
}

// ---------- Kommentare ----------

export async function addIdeaComment(ideaId: string, body: string) {
  return run(async () => {
    const me = await requireUser();
    const idea = await getVisibleIdea(me, ideaId);
    const text = body.trim();
    if (!text) throw new Error("Bitte einen Kommentar eingeben.");
    if (text.length > 5000) throw new Error("Der Kommentar ist zu lang (max. 5000 Zeichen).");
    await db.insert(ideaComments).values({ id: randomUUID(), ideaId, authorId: me.id, body: text });
    await notifyIdea(
      ideaId,
      me.id,
      await participants(idea.customerId),
      "idea_comment",
      `${me.name} zu „${short(idea.title, 50)}“: „${short(text)}“`,
    );
    refresh();
    return null;
  });
}

async function getComment(id: string) {
  const [c] = await db.select().from(ideaComments).where(eq(ideaComments.id, id));
  if (!c) throw new Error("Kommentar nicht gefunden.");
  return c;
}

export async function editIdeaComment(commentId: string, body: string) {
  return run(async () => {
    const me = await requireUser();
    const c = await getComment(commentId);
    if (c.authorId !== me.id) throw new Error("Nur der Verfasser kann den Kommentar bearbeiten.");
    await getVisibleIdea(me, c.ideaId);
    const text = body.trim();
    if (!text) throw new Error("Der Kommentar darf nicht leer sein.");
    if (text.length > 5000) throw new Error("Der Kommentar ist zu lang (max. 5000 Zeichen).");
    if (text !== c.body) {
      await db.update(ideaComments).set({ body: text, editedAt: new Date() }).where(eq(ideaComments.id, commentId));
    }
    refresh();
    return null;
  });
}

export async function deleteIdeaComment(commentId: string) {
  return run(async () => {
    const me = await requireUser();
    const c = await getComment(commentId);
    if (me.role !== "admin" && c.authorId !== me.id) throw new Error("Keine Berechtigung.");
    await getVisibleIdea(me, c.ideaId);
    await db.delete(ideaComments).where(eq(ideaComments.id, commentId));
    refresh();
    return null;
  });
}

// Idee geöffnet → zugehörige Inbox-Meldungen als gelesen markieren
export async function markIdeaRead(ideaId: string) {
  return run(async () => {
    const me = await requireUser();
    const updated = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, me.id), eq(notifications.ideaId, ideaId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    if (updated.length > 0) refresh();
    return null;
  });
}
