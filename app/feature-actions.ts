"use server";

// Featureboard: vorschlagen (alle), upvoten (alle), Status setzen (Admins),
// kommentieren (Ersteller + Admins), Kommentar bearbeiten (Verfasser), Kommentar löschen (Verfasser + Admins),
// Feature bearbeiten/löschen (Ersteller + Admins). Inbox-Meldungen gehen an Admins bzw. an den Ersteller.

import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { featureAttachments, featureComments, featureRequests, featureVotes, notifications, user } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { FEATURE_STATUSES, FEATURE_STATUS_LABELS } from "@/lib/features";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Unbekannter Fehler" };
  }
}

async function getFeature(id: string) {
  const [f] = await db.select().from(featureRequests).where(eq(featureRequests.id, id));
  if (!f) throw new Error("Feature nicht gefunden.");
  return f;
}

async function adminIds() {
  return (await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"))).map((r) => r.id);
}

async function notifyFeature(featureId: string, actorId: string, to: (string | null)[], type: string, text: string) {
  const ids = [...new Set(to.filter((id): id is string => !!id && id !== actorId))];
  if (ids.length === 0) return;
  await db
    .insert(notifications)
    .values(ids.map((userId) => ({ id: randomUUID(), userId, featureId, type, text, actorId })));
}

const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)} …` : s);

// ---------- Features ----------

export async function createFeature(input: { title: string; description: string }) {
  return run(async () => {
    const me = await requireUser();
    const title = input.title.trim();
    const description = input.description.trim();
    if (!title) throw new Error("Bitte die Idee in einem Satz beschreiben.");
    if (title.length > 200) throw new Error("Die Idee ist zu lang (max. 200 Zeichen).");
    if (description.length > 5000) throw new Error("Die Beschreibung ist zu lang (max. 5000 Zeichen).");
    const id = randomUUID();
    await db.insert(featureRequests).values({ id, title, description: description || null, createdBy: me.id });
    await notifyFeature(id, me.id, await adminIds(), "feature", `Neuer Vorschlag: „${short(title)}“`);
    refresh();
    return { id };
  });
}

// Titel und Beschreibung nachträglich ändern (Ersteller + Admins)
export async function updateFeature(id: string, input: { title: string; description: string }) {
  return run(async () => {
    const me = await requireUser();
    const f = await getFeature(id);
    if (me.role !== "admin" && f.createdBy !== me.id) throw new Error("Keine Berechtigung.");
    const title = input.title.trim();
    const description = input.description.trim();
    if (!title) throw new Error("Bitte die Idee in einem Satz beschreiben.");
    if (title.length > 200) throw new Error("Die Idee ist zu lang (max. 200 Zeichen).");
    if (description.length > 5000) throw new Error("Die Beschreibung ist zu lang (max. 5000 Zeichen).");
    await db
      .update(featureRequests)
      .set({ title, description: description || null })
      .where(eq(featureRequests.id, id));
    refresh();
    return null;
  });
}

export async function deleteFeature(id: string) {
  return run(async () => {
    const me = await requireUser();
    const f = await getFeature(id);
    if (me.role !== "admin" && f.createdBy !== me.id) throw new Error("Keine Berechtigung.");
    await db.delete(featureRequests).where(eq(featureRequests.id, id));
    refresh();
    return null;
  });
}

// Stimme abgeben bzw. zurücknehmen
export async function toggleVote(featureId: string) {
  return run(async () => {
    const me = await requireUser();
    await getFeature(featureId);
    const removed = await db
      .delete(featureVotes)
      .where(and(eq(featureVotes.featureId, featureId), eq(featureVotes.userId, me.id)))
      .returning({ id: featureVotes.featureId });
    if (removed.length === 0) {
      await db.insert(featureVotes).values({ featureId, userId: me.id }).onConflictDoNothing();
    }
    refresh();
    return { voted: removed.length === 0 };
  });
}

export async function setFeatureStatus(featureId: string, status: string) {
  return run(async () => {
    const me = await requireUser("admin");
    if (!(FEATURE_STATUSES as readonly string[]).includes(status)) throw new Error("Unbekannter Status.");
    const f = await getFeature(featureId);
    if (f.status === status) return null;
    await db
      .update(featureRequests)
      .set({ status, completedAt: status === "abgeschlossen" ? new Date() : null })
      .where(eq(featureRequests.id, featureId));
    await notifyFeature(
      featureId,
      me.id,
      [f.createdBy],
      "feature_status",
      `„${short(f.title)}“ ist jetzt: ${FEATURE_STATUS_LABELS[status]}`,
    );
    refresh();
    return null;
  });
}

// Screenshot entfernen (Ersteller oder Admin) – hochgeladen wird über /api/features/[id]/images
export async function deleteFeatureImage(imageId: string) {
  return run(async () => {
    const me = await requireUser();
    const [img] = await db
      .select({ featureId: featureAttachments.featureId })
      .from(featureAttachments)
      .where(eq(featureAttachments.id, imageId));
    if (!img) throw new Error("Screenshot nicht gefunden.");
    const f = await getFeature(img.featureId);
    if (me.role !== "admin" && f.createdBy !== me.id) throw new Error("Keine Berechtigung.");
    await db.delete(featureAttachments).where(eq(featureAttachments.id, imageId));
    refresh();
    return null;
  });
}

// ---------- Kommentare ----------

export async function addFeatureComment(featureId: string, body: string) {
  return run(async () => {
    const me = await requireUser();
    const f = await getFeature(featureId);
    if (me.role !== "admin" && f.createdBy !== me.id) {
      throw new Error("Kommentieren können nur der Ersteller und das Team.");
    }
    const text = body.trim();
    if (!text) throw new Error("Bitte einen Kommentar eingeben.");
    if (text.length > 5000) throw new Error("Der Kommentar ist zu lang (max. 5000 Zeichen).");
    await db.insert(featureComments).values({ id: randomUUID(), featureId, authorId: me.id, body: text });
    // Ersteller schreibt → Admins informieren; Team antwortet → Ersteller informieren
    const to = me.role === "admin" ? [f.createdBy] : await adminIds();
    await notifyFeature(
      featureId,
      me.id,
      to,
      "feature_comment",
      `Kommentar zu „${short(f.title, 50)}“: „${short(text)}“`,
    );
    refresh();
    return null;
  });
}

async function getComment(id: string) {
  const [c] = await db.select().from(featureComments).where(eq(featureComments.id, id));
  if (!c) throw new Error("Kommentar nicht gefunden.");
  return c;
}

// Bearbeiten: nur der Verfasser selbst
export async function editFeatureComment(commentId: string, body: string) {
  return run(async () => {
    const me = await requireUser();
    const c = await getComment(commentId);
    if (c.authorId !== me.id) throw new Error("Nur der Verfasser kann den Kommentar bearbeiten.");
    const text = body.trim();
    if (!text) throw new Error("Der Kommentar darf nicht leer sein.");
    if (text.length > 5000) throw new Error("Der Kommentar ist zu lang (max. 5000 Zeichen).");
    if (text !== c.body) {
      await db
        .update(featureComments)
        .set({ body: text, editedAt: new Date() })
        .where(eq(featureComments.id, commentId));
    }
    refresh();
    return null;
  });
}

// Löschen: Verfasser oder Admin
export async function deleteFeatureComment(commentId: string) {
  return run(async () => {
    const me = await requireUser();
    const c = await getComment(commentId);
    if (me.role !== "admin" && c.authorId !== me.id) throw new Error("Keine Berechtigung.");
    await db.delete(featureComments).where(eq(featureComments.id, commentId));
    refresh();
    return null;
  });
}

// Feature geöffnet → zugehörige Inbox-Meldungen als gelesen markieren
export async function markFeatureRead(featureId: string) {
  return run(async () => {
    const me = await requireUser();
    const updated = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, me.id), eq(notifications.featureId, featureId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    if (updated.length > 0) refresh();
    return null;
  });
}
