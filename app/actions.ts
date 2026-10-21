"use server";

import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { jobComments, jobCutters, jobFiles, jobs, notifications, user } from "@/db/schema";
import { FrameioError, createFolder, createJobFolder, createUpload, deleteFile, deleteFolder, renameFolder } from "@/lib/frameio";
import { requireUser } from "@/lib/session";
import { nextPartTitle } from "@/lib/queries";
import { canSeeJob, clientIdsOfCutter } from "@/lib/access";
import { CUSTOMER_DATE_STATUSES, FORMATS, STATUSES, VIDEO_LENGTHS } from "@/lib/status";
import { isAllowedFile, ALLOWED_LABEL } from "@/lib/file-types";

// ---------- Hilfsfunktionen ----------

// Ergebnis einer Aktion: entweder ok mit Daten oder ein Fehlertext für die Oberfläche
export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Unbekannter Fehler" };
  }
}

async function getJob(jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error("Projekt nicht gefunden.");
  return job;
}

async function isCutterOf(jobId: string, userId: string) {
  const [row] = await db
    .select()
    .from(jobCutters)
    .where(and(eq(jobCutters.jobId, jobId), eq(jobCutters.userId, userId)));
  return !!row;
}

// Darf dieser Nutzer am Projekt arbeiten? (zugeordneter Cutter oder Admin)
async function requireCutterOf(jobId: string) {
  const me = await requireUser("cutter", "admin");
  if (me.role !== "admin" && !(await isCutterOf(jobId, me.id))) {
    throw new Error("Nur die zugeordneten Cutter können das.");
  }
  return me;
}

// Status nur ändern, wenn das Projekt noch im erwarteten Status ist
async function changeStatus(jobId: string, from: string, to: string, extra: Partial<typeof jobs.$inferInsert> = {}) {
  const updated = await db
    .update(jobs)
    .set({ status: to, updatedAt: new Date(), ...extra })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, from)))
    .returning({ id: jobs.id });
  if (updated.length === 0) {
    throw new Error("Das Projekt wurde inzwischen geändert. Bitte Seite neu laden.");
  }
}

async function addCutterRow(jobId: string, userId: string) {
  await db.insert(jobCutters).values({ jobId, userId }).onConflictDoNothing();
}

type Job = typeof jobs.$inferSelect;
type Me = Awaited<ReturnType<typeof requireUser>>;

// Darf dieser Nutzer das Projekt sehen? Kunden nur ihre eigenen, Cutter nur freigegebene Kunden (lib/access.ts)
async function assertCanSee(me: Me, job: Job) {
  if (!(await canSeeJob(me, job))) throw new Error("Keine Berechtigung.");
}

// Solange eine Stornierung angefragt ist, ruht die Arbeit am Projekt
function assertNotPaused(job: Job) {
  if (job.cancelRequestedAt) {
    throw new Error("Stornierung angefragt – die Arbeit ist pausiert, bis ein Admin entschieden hat.");
  }
}

async function cutterIdsOf(jobId: string) {
  const rows = await db.select({ id: jobCutters.userId }).from(jobCutters).where(eq(jobCutters.jobId, jobId));
  return rows.map((r) => r.id);
}

async function adminIds() {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"));
  return rows.map((r) => r.id);
}

// Inbox-Einträge erzeugen. Wer bekommt was?
// - "file" (nachgereicht): Kunde + zugeordnete Cutter (gibt es noch keinen Cutter, die Admins)
// - "comment": Kunde + zugeordnete Cutter, nie Admins
// - "status": genau die übergebenen Empfänger
// - "storno_request": Cutter + alle Admins (Admins entscheiden)
// - "storno_decision": Kunde + Cutter
// Wer die Aktion selbst ausgelöst hat, bekommt nichts.
async function notify(
  job: Job,
  actor: { id: string },
  type: "file" | "comment" | "storno_request" | "storno_decision" | "status",
  text: string,
  fileId?: string,
  skip: Set<string> = new Set(),
  // nur bei "status": wer genau benachrichtigt wird
  to?: string[],
) {
  const cutters = await cutterIdsOf(job.id);
  let recipients: string[];
  if (to) recipients = to;
  else if (type === "storno_request") recipients = [...cutters, ...(await adminIds())];
  else if (type === "storno_decision") recipients = [job.customerId, ...cutters];
  // Kommentare: nur Kunde und zuständige Cutter – Admins nie (auch nicht, solange kein Cutter zugeordnet ist)
  else if (type === "comment") recipients = [job.customerId, ...cutters];
  else recipients = [job.customerId, ...(cutters.length > 0 ? cutters : await adminIds())];

  const unique = [...new Set(recipients)].filter((id) => id !== actor.id && !skip.has(id));
  unique.forEach((id) => skip.add(id));
  if (unique.length === 0) return;
  await db
    .insert(notifications)
    .values(
      unique.map((userId) => ({
        id: randomUUID(),
        userId,
        jobId: job.id,
        type,
        text,
        actorId: actor.id,
        fileId: fileId ?? null,
      })),
    );
}

// Teilen sich mehrere Projekte (Duplikate) denselben Frame.io-Ordner?
async function folderShared(job: Job) {
  if (!job.frameioFolderId) return false;
  const others = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.frameioFolderId, job.frameioFolderId), ne(jobs.id, job.id)));
  return others.length > 0;
}

// Original + Duplikate ("Teil 2" …) teilen sich den Raw-Ordner und damit das Rohmaterial
async function familyOf(job: Job): Promise<Job[]> {
  if (!job.rawFolderId) return [job];
  return db.select().from(jobs).where(eq(jobs.rawFolderId, job.rawFolderId));
}

// Beim Status "Online" heißt der Review-Ordner "Online" (bei Duplikaten mit Titel), sonst wieder "ToBeReviewed".
// Schlägt das fehl (z. B. Frame.io kurz nicht erreichbar), bleibt der Status trotzdem gesetzt.
async function nameReviewFolder(jobId: string, online: boolean) {
  try {
    const job = await getJob(jobId);
    if (!job.reviewFolderId) return;
    const base = online ? "Online" : "ToBeReviewed";
    const shared = !!job.parentJobId || (await folderShared(job));
    await renameFolder(job.reviewFolderId, shared ? `${base} – ${job.title}` : base);
  } catch (e) {
    console.error("Review-Ordner konnte nicht umbenannt werden:", e);
  }
}

// Frame.io-Fehler beim Löschen verständlich an die Oberfläche geben
function deleteError(e: unknown): never {
  console.error("Löschen in Frame.io fehlgeschlagen:", e);
  const code = e instanceof FrameioError ? ` (Fehler ${e.status})` : "";
  throw new Error(`Das Löschen hat nicht geklappt${code}. Es wurde nichts gelöscht – bitte später nochmal versuchen.`);
}

// ---------- Client: Projekt anlegen und hochladen ----------

export type NewJobInput = {
  title: string;
  format: string;
  platforms: string[]; // mehrere möglich, z. B. Instagram + TikTok
  videoLength: string;
  content: string;
  specialNotes: string;
  customerId?: string; // nur Admins/Cutter: Projekt für einen Client anlegen
};

// Schritt 1: Projekt als Entwurf anlegen, inkl. Ordner in Frame.io
export async function createJob(input: NewJobInput) {
  return run(async () => {
    const me = await requireUser("kunde", "cutter", "admin");
    const platforms = [...new Set(input.platforms.map((p) => p.trim()).filter(Boolean))];
    if (platforms.length === 0) throw new Error("Bitte mindestens eine Plattform auswählen.");

    const required = [input.title, input.content, input.specialNotes].map((v) => v.trim());
    if (required.some((v) => v.length === 0)) {
      throw new Error("Bitte alle Pflichtfelder ausfüllen.");
    }
    if (!FORMATS.some((f) => f.value === input.format)) {
      throw new Error("Bitte ein Format auswählen.");
    }
    // Videolänge: feste Kategorie je Format, bei Clipping keine
    const lengths = VIDEO_LENGTHS[input.format] ?? [];
    if (lengths.length > 0 && !lengths.includes(input.videoLength)) throw new Error("Bitte eine Videolänge auswählen.");
    if (lengths.length === 0) input.videoLength = "";

    // Für wen ist das Projekt? Kunden immer für sich selbst, Admins und Cutter für einen Client
    let customer = { id: me.id, name: me.name };
    if (me.role !== "kunde") {
      if (!input.customerId) throw new Error("Bitte einen Client auswählen.");
      const [c] = await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(and(eq(user.id, input.customerId), eq(user.role, "kunde")));
      if (!c) throw new Error("Client nicht gefunden.");
      if (me.role === "cutter" && !(await clientIdsOfCutter(me.id)).includes(c.id)) {
        throw new Error("Dieser Kunde ist für dich nicht freigegeben.");
      }
      customer = c;
    }

    const folder = await createJobFolder(`${customer.name} – ${input.title.trim()}`);
    const id = randomUUID();
    await db.insert(jobs).values({
      id,
      customerId: customer.id,
      title: input.title.trim(),
      format: input.format,
      platform: platforms.join(", "),
      videoLength: input.videoLength.trim(),
      content: input.content.trim(),
      specialNotes: input.specialNotes.trim(),
      status: "entwurf",
      frameioFolderId: folder.id,
      frameioFolderUrl: folder.url,
      rawFolderId: folder.rawId,
    });
    return { jobId: id };
  });
}

// Upload-Links für eine Datei holen
// "roh": Rohmaterial – vom Kunden oder Staff, in jedem Status (danach gilt es als "nachgereicht")
// "fertig": fertiges Video (vom zugeordneten Cutter, während "Wird jetzt gemacht")
export async function requestUpload(jobId: string, kind: "roh" | "fertig", file: { name: string; size: number }) {
  return run(async () => {
    const me = await requireUser();
    const job = await getJob(jobId);

    if (kind === "roh") {
      await assertCanSee(me, job);
      if (job.status === "storniert") throw new Error("Das Projekt ist storniert.");
      if (!isAllowedFile(file.name)) throw new Error(`Dieser Dateityp wird nicht unterstützt (erlaubt: ${ALLOWED_LABEL}).`);
    } else {
      await requireCutterOf(jobId);
      assertNotPaused(job);
      if (job.status !== "in_arbeit") {
        throw new Error("Hochladen geht nur, solange das Projekt in Arbeit ist.");
      }
    }

    // Rohmaterial → Ordner "Raw", fertige Videos → Ordner "ToBeReviewed" (wird bei Bedarf angelegt)
    let folderId = job.rawFolderId ?? job.frameioFolderId!;
    if (kind === "fertig") {
      folderId = job.reviewFolderId ?? "";
      if (!folderId) {
        // Duplikate ("Teil 2") teilen sich den Projektordner – jedes bekommt seinen eigenen Review-Ordner
        const name = job.parentJobId || (await folderShared(job)) ? `ToBeReviewed – ${job.title}` : "ToBeReviewed";
        const created = await createFolder(job.frameioFolderId!, name);
        folderId = created.id;
        await db.update(jobs).set({ reviewFolderId: folderId }).where(eq(jobs.id, jobId));
      }
    }
    const upload = await createUpload(folderId, file.name, file.size);
    await db.update(jobs).set({ updatedAt: new Date() }).where(eq(jobs.id, jobId)); // Lebenszeichen
    const id = randomUUID();
    await db.insert(jobFiles).values({
      id,
      jobId,
      kind,
      name: file.name,
      size: file.size,
      frameioFileId: upload.fileId,
      frameioUrl: upload.viewUrl,
      uploadedBy: me.id,
      late: kind === "roh" && job.status !== "entwurf",
    });
    return { fileRowId: id, mediaType: upload.mediaType, parts: upload.parts };
  });
}

// Datei als vollständig hochgeladen markieren
export async function confirmUpload(fileRowId: string) {
  return run(async () => {
    const me = await requireUser();
    const [file] = await db.select().from(jobFiles).where(eq(jobFiles.id, fileRowId));
    if (!file) throw new Error("Datei nicht gefunden.");
    const job = await getJob(file.jobId);
    await assertCanSee(me, job);
    if (file.uploadedBy && file.uploadedBy !== me.id && me.role !== "admin") throw new Error("Keine Berechtigung.");
    await db.update(jobFiles).set({ uploaded: true }).where(eq(jobFiles.id, fileRowId));
    if (file.late && file.kind === "roh") {
      // Rohmaterial gilt für alle Teile (Duplikate) – Beteiligte aller Teile informieren, jede Person nur einmal
      const notified = new Set<string>();
      for (const part of await familyOf(job)) {
        await notify(part, me, "file", `${me.name} hat „${file.name}“ nachgereicht`, file.id, notified);
      }
      refresh();
    } else if (file.late) {
      await notify(job, me, "file", `${me.name} hat „${file.name}“ nachgereicht`, file.id);
      refresh();
    }
    return null;
  });
}

// Schritt 3: Projekt abschicken → erscheint bei den Cuttern in "To Dos"
export async function submitJob(jobId: string) {
  return run(async () => {
    const me = await requireUser();
    const job = await getJob(jobId);
    if (job.customerId !== me.id && me.role === "kunde") throw new Error("Keine Berechtigung.");
    const files = await db
      .select({ id: jobFiles.id })
      .from(jobFiles)
      .where(and(eq(jobFiles.jobId, jobId), eq(jobFiles.kind, "roh"), eq(jobFiles.uploaded, true)));
    // Kunden müssen Material mitschicken; Staff darf ohne Dateien anlegen (z. B. Material liegt schon in Frame.io)
    if (files.length === 0 && me.role === "kunde") throw new Error("Bitte mindestens eine Datei hochladen.");
    await changeStatus(jobId, "entwurf", "todo", { submittedAt: new Date() });
    refresh();
    return null;
  });
}

// ---------- Upload-Vorgänge: Lebenszeichen & Verwerfen ----------
// Solange im Browser ein Upload läuft, meldet er sich alle paar Minuten. Bleibt das 30 Minuten aus
// (Tab geschlossen, neu geladen, Rechner aus), räumt lib/cleanup.ts den Entwurf bzw. halbe Dateien weg.

export async function uploadHeartbeat(jobIds: string[]) {
  return run(async () => {
    const me = await requireUser();
    for (const jobId of jobIds.slice(0, 20)) {
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      if (job && (await canSeeJob(me, job))) {
        await db.update(jobs).set({ updatedAt: new Date() }).where(eq(jobs.id, jobId));
      }
    }
    return null;
  });
}

// Upload-Vorgang verwerfen:
// - neues Projekt (noch Entwurf): Projekt samt Frame.io-Ordner und Dateien löschen
// - nachgereichtes Material: nur die eigenen, nicht fertig hochgeladenen Dateien entfernen
export async function discardUpload(jobId: string) {
  return run(async () => {
    const me = await requireUser();
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) return null; // schon weg (z. B. automatisch aufgeräumt)
    await assertCanSee(me, job);
    if (job.status === "entwurf") {
      if (job.frameioFolderId && !(await folderShared(job))) await deleteFolder(job.frameioFolderId).catch(deleteError);
      await db.delete(jobs).where(eq(jobs.id, jobId));
    } else {
      const pending = await db
        .select()
        .from(jobFiles)
        .where(and(eq(jobFiles.jobId, jobId), eq(jobFiles.uploaded, false), eq(jobFiles.uploadedBy, me.id)));
      for (const f of pending) {
        await deleteFile(f.frameioFileId).catch((e) => console.error("Halbe Datei nicht gelöscht:", e));
        await db.delete(jobFiles).where(eq(jobFiles.id, f.id));
      }
    }
    refresh();
    return null;
  });
}

// ---------- Cutter ----------

// To Dos → Wird jetzt gemacht: Projekt übernehmen und sofort loslegen
export async function claimJob(jobId: string) {
  return run(async () => {
    const me = await requireUser("cutter", "admin");
    const job = await getJob(jobId);
    await assertCanSee(me, job);
    assertNotPaused(job);
    await changeStatus(jobId, "todo", "in_arbeit");
    await addCutterRow(jobId, me.id);
    refresh();
    return null;
  });
}

// To Dos → Warteschlange: Projekt für sich reservieren, später starten
export async function reserveJob(jobId: string) {
  return run(async () => {
    const me = await requireUser("cutter", "admin");
    const job = await getJob(jobId);
    await assertCanSee(me, job);
    assertNotPaused(job);
    await changeStatus(jobId, "todo", "warteschlange");
    await addCutterRow(jobId, me.id);
    refresh();
    return null;
  });
}

// Warteschlange → Wird jetzt gemacht (nur zugeordnete Cutter oder Admins)
export async function startJob(jobId: string) {
  return run(async () => {
    await requireCutterOf(jobId);
    assertNotPaused(await getJob(jobId));
    await changeStatus(jobId, "warteschlange", "in_arbeit");
    refresh();
    return null;
  });
}

// Wird jetzt gemacht → Wartet auf Feedback
// Mit Link: Cutter fügt einen vorhandenen Review-Link ein.
// Ohne Link: der Link des zuletzt in der App hochgeladenen Videos wird genommen.
export async function submitForReview(jobId: string, reviewUrl?: string) {
  return run(async () => {
    await requireCutterOf(jobId);
    assertNotPaused(await getJob(jobId));
    let url = reviewUrl?.trim();
    if (!url) {
      const [latest] = await db
        .select({ url: jobFiles.frameioUrl })
        .from(jobFiles)
        .where(and(eq(jobFiles.jobId, jobId), eq(jobFiles.kind, "fertig"), eq(jobFiles.uploaded, true)))
        .orderBy(desc(jobFiles.createdAt))
        .limit(1);
      url = latest?.url ?? undefined;
    }
    if (!url || !/^https?:\/\//.test(url)) {
      throw new Error("Bitte das Video hochladen oder einen gültigen Review-Link einfügen.");
    }
    await changeStatus(jobId, "in_arbeit", "feedback", { reviewUrl: url });
    refresh();
    return null;
  });
}

// Weiteren Cutter zum Projekt hinzufügen (Admin oder bereits zugeordneter Cutter)
export async function addCutter(jobId: string, cutterId: string) {
  return run(async () => {
    await requireCutterOf(jobId);
    const [c] = await db.select({ role: user.role }).from(user).where(eq(user.id, cutterId));
    if (!c || (c.role !== "cutter" && c.role !== "admin")) throw new Error("Kein Cutter.");
    await addCutterRow(jobId, cutterId);
    refresh();
    return null;
  });
}

// Eigene Verfügbarkeit umschalten (Admins dürfen das für alle)
export async function setActive(userId: string, active: boolean) {
  return run(async () => {
    const me = await requireUser("cutter", "admin");
    if (me.role !== "admin" && me.id !== userId) {
      throw new Error("Du kannst nur deine eigene Verfügbarkeit ändern.");
    }
    await db.update(user).set({ active }).where(eq(user.id, userId));
    refresh();
    return null;
  });
}

// Review-Link nachträglich ändern (Admin oder zugeordneter Cutter)
export async function updateReviewUrl(jobId: string, reviewUrl: string) {
  return run(async () => {
    await requireCutterOf(jobId);
    const url = reviewUrl.trim();
    if (url && !/^https?:\/\//.test(url)) throw new Error("Bitte einen gültigen Link einfügen.");
    await db
      .update(jobs)
      .set({ reviewUrl: url || null })
      .where(eq(jobs.id, jobId));
    refresh();
    return null;
  });
}

// ---------- Admin ----------

// Wartet auf Feedback → zurück in die Warteschlange des Cutters (Feedback steht als Kommentar in Frame.io)
export async function sendBack(jobId: string) {
  return run(async () => {
    await requireUser("admin");
    await changeStatus(jobId, "feedback", "warteschlange");
    refresh();
    return null;
  });
}

// Wartet auf Feedback → Ready to post
export async function markReady(jobId: string) {
  return run(async () => {
    await requireUser("admin");
    await changeStatus(jobId, "feedback", "ready_to_post");
    refresh();
    return null;
  });
}

// Wartet auf Feedback → an den Kunden zur Abnahme (Kunde sieht dann Video und Review-Link)
export async function sendToClient(jobId: string) {
  return run(async () => {
    const me = await requireUser("admin");
    const job = await getJob(jobId);
    await changeStatus(jobId, "feedback", "feedback_client");
    await notify(job, me, "status", `Dein Video „${job.title}“ ist fertig – bitte ansehen und freigeben`, undefined, new Set(), [
      job.customerId,
    ]);
    refresh();
    return null;
  });
}

// Kunden-Feedback: Kunde (oder Admin) gibt frei → Ready to post
export async function clientApprove(jobId: string) {
  return run(async () => {
    const me = await requireUser();
    const job = await getJob(jobId);
    if (me.role === "cutter") throw new Error("Keine Berechtigung.");
    if (me.role === "kunde" && job.customerId !== me.id) throw new Error("Keine Berechtigung.");
    await changeStatus(jobId, "feedback_client", "ready_to_post");
    const to = [...(await cutterIdsOf(jobId)), ...(await adminIds()), job.customerId];
    await notify(job, me, "status", `${me.name} hat „${job.title}“ freigegeben`, undefined, new Set(), to);
    refresh();
    return null;
  });
}

// Kunden-Feedback: Kunde (oder Admin) schickt zurück → Warteschlange des Cutters.
// Der Änderungswunsch wird als Kommentar gespeichert.
export async function clientRequestChanges(jobId: string, note: string) {
  return run(async () => {
    const me = await requireUser();
    const job = await getJob(jobId);
    if (me.role === "cutter") throw new Error("Keine Berechtigung.");
    if (me.role === "kunde" && job.customerId !== me.id) throw new Error("Keine Berechtigung.");
    const text = note.trim();
    if (me.role === "kunde" && !text) throw new Error("Bitte beschreib kurz, was geändert werden soll.");
    if (text.length > 5000) throw new Error("Der Text ist zu lang (max. 5000 Zeichen).");
    await changeStatus(jobId, "feedback_client", "warteschlange");
    if (text) await db.insert(jobComments).values({ id: randomUUID(), jobId, authorId: me.id, body: text });
    const preview = text.length > 80 ? `${text.slice(0, 80)} …` : text;
    const to = [...(await cutterIdsOf(jobId)), ...(await adminIds()), job.customerId];
    await notify(
      job,
      me,
      "status",
      `${me.name} möchte Änderungen an „${job.title}“${preview ? `: „${preview}“` : ""}`,
      undefined,
      new Set(),
      to,
    );
    refresh();
    return null;
  });
}

// Ready to post → Online
export async function markOnline(jobId: string) {
  return run(async () => {
    await requireUser("admin");
    await changeStatus(jobId, "ready_to_post", "online");
    await nameReviewFolder(jobId, true);
    refresh();
    return null;
  });
}

// Status frei setzen (z. B. Storniert)
export async function setStatus(jobId: string, status: string) {
  return run(async () => {
    await requireUser("admin");
    if (!(STATUSES as readonly string[]).includes(status)) throw new Error("Unbekannter Status.");
    const before = await getJob(jobId);
    await db.update(jobs).set({ status, updatedAt: new Date() }).where(eq(jobs.id, jobId));
    if (status === "online" && before.status !== "online") await nameReviewFolder(jobId, true);
    if (status !== "online" && before.status === "online") await nameReviewFolder(jobId, false);
    refresh();
    return null;
  });
}

export async function setFormat(jobId: string, format: string) {
  return run(async () => {
    await requireUser("admin");
    if (!FORMATS.some((f) => f.value === format)) throw new Error("Unbekanntes Format.");
    await db.update(jobs).set({ format, updatedAt: new Date() }).where(eq(jobs.id, jobId));
    refresh();
    return null;
  });
}

// Abgerechnet (Cutter) an/aus
// which: "cutter" = Leistung des Cutters abgerechnet, "kunde" = gegenüber dem Kunden abgerechnet
export async function setBilled(jobId: string, value: boolean, which: "cutter" | "kunde" = "cutter") {
  return run(async () => {
    await requireUser("admin");
    await db
      .update(jobs)
      .set(which === "kunde" ? { billedCustomer: value } : { billed: value })
      .where(eq(jobs.id, jobId));
    refresh();
    return null;
  });
}

export async function removeCutter(jobId: string, cutterId: string) {
  return run(async () => {
    await requireUser("admin");
    await db.delete(jobCutters).where(and(eq(jobCutters.jobId, jobId), eq(jobCutters.userId, cutterId)));
    refresh();
    return null;
  });
}

// ---------- Admin oder Kunde ----------

// Veröffentlichungsdatum setzen ("YYYY-MM-DD" oder leer zum Entfernen)
export async function setPublishDate(jobId: string, date: string) {
  return run(async () => {
    const me = await requireUser("kunde", "admin");
    const job = await getJob(jobId);
    if (me.role !== "admin" && job.customerId !== me.id) throw new Error("Keine Berechtigung.");
    // Admins planen frei; Kunden tragen ihr Datum ein, sobald das Video freigegeben ist
    if (me.role !== "admin" && !CUSTOMER_DATE_STATUSES.includes(job.status)) {
      throw new Error("Ein Datum kann erst ab „Ready to post“ eingetragen werden.");
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Ungültiges Datum.");
    await db
      .update(jobs)
      .set({ publishDate: date || null })
      .where(eq(jobs.id, jobId));
    refresh();
    return null;
  });
}

// ---------- Kommentare & Inbox ----------

// Kommentar am Projekt schreiben – landet bei den Beteiligten in der Inbox
export async function addComment(jobId: string, body: string) {
  return run(async () => {
    const me = await requireUser();
    const job = await getJob(jobId);
    await assertCanSee(me, job);
    const text = body.trim();
    if (!text) throw new Error("Bitte einen Kommentar eingeben.");
    if (text.length > 5000) throw new Error("Der Kommentar ist zu lang (max. 5000 Zeichen).");
    await db.insert(jobComments).values({ id: randomUUID(), jobId, authorId: me.id, body: text });
    await notify(job, me, "comment", commentNotice(me.name, text));
    refresh();
    return null;
  });
}

// Inbox-Text, den ein Kommentar bei den Beteiligten erzeugt (zum Anpassen/Entfernen beim Bearbeiten/Löschen)
function commentNotice(authorName: string, text: string) {
  const preview = text.length > 80 ? `${text.slice(0, 80)} …` : text;
  return `${authorName}: „${preview}“`;
}

async function getComment(commentId: string) {
  const [c] = await db.select().from(jobComments).where(eq(jobComments.id, commentId));
  if (!c) throw new Error("Kommentar nicht gefunden.");
  return c;
}

// Eigenen Kommentar bearbeiten – wird mit „bearbeitet“ gekennzeichnet
export async function editComment(commentId: string, body: string) {
  return run(async () => {
    const me = await requireUser();
    const c = await getComment(commentId);
    if (c.authorId !== me.id) throw new Error("Nur der Verfasser kann den Kommentar bearbeiten.");
    await assertCanSee(me, await getJob(c.jobId));
    const text = body.trim();
    if (!text) throw new Error("Der Kommentar darf nicht leer sein.");
    if (text.length > 5000) throw new Error("Der Kommentar ist zu lang (max. 5000 Zeichen).");
    if (text === c.body) return null;
    await db.update(jobComments).set({ body: text, editedAt: new Date() }).where(eq(jobComments.id, commentId));
    // Inbox-Einträge zu diesem Kommentar zeigen den neuen Text
    await db
      .update(notifications)
      .set({ text: commentNotice(me.name, text) })
      .where(
        and(
          eq(notifications.jobId, c.jobId),
          eq(notifications.type, "comment"),
          eq(notifications.actorId, me.id),
          eq(notifications.text, commentNotice(me.name, c.body)),
        ),
      );
    refresh();
    return null;
  });
}

// Kommentar löschen – der Verfasser selbst oder ein Admin
export async function deleteComment(commentId: string) {
  return run(async () => {
    const me = await requireUser();
    const c = await getComment(commentId);
    if (c.authorId !== me.id && me.role !== "admin") throw new Error("Keine Berechtigung.");
    await assertCanSee(me, await getJob(c.jobId));
    await db.delete(jobComments).where(eq(jobComments.id, commentId));
    // Zugehörige Inbox-Einträge mit entfernen
    if (c.authorId) {
      const [author] = await db.select({ name: user.name }).from(user).where(eq(user.id, c.authorId));
      if (author) {
        await db
          .delete(notifications)
          .where(
            and(
              eq(notifications.jobId, c.jobId),
              eq(notifications.type, "comment"),
              eq(notifications.actorId, c.authorId),
              eq(notifications.text, commentNotice(author.name, c.body)),
            ),
          );
      }
    }
    refresh();
    return null;
  });
}

// Projekt geöffnet → alle Benachrichtigungen dazu als gelesen markieren
export async function markJobRead(jobId: string) {
  return run(async () => {
    const me = await requireUser();
    const updated = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, me.id), eq(notifications.jobId, jobId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    if (updated.length > 0) refresh();
    return null;
  });
}

export async function markAllRead() {
  return run(async () => {
    const me = await requireUser();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)));
    refresh();
    return null;
  });
}

// ---------- Duplizieren ("Teil 2") ----------

// Neues Projekt mit gleichem Briefing und Rohmaterial – jeder Clip einzeln abrechenbar
export async function duplicateJob(jobId: string, title?: string) {
  return run(async () => {
    const me = await requireUser("cutter", "admin");
    const job = await getJob(jobId);
    await assertCanSee(me, job);
    if (job.status === "entwurf") throw new Error("Das Projekt wird noch hochgeladen.");
    const newTitle = (title ?? "").trim() || (await nextPartTitle(job));
    const id = randomUUID();
    await db.insert(jobs).values({
      id,
      customerId: job.customerId,
      title: newTitle,
      format: job.format,
      platform: job.platform,
      videoLength: job.videoLength,
      content: job.content,
      specialNotes: job.specialNotes,
      status: "todo",
      // gleicher Frame.io-Ordner und gleiches Rohmaterial, eigener Review-Ordner beim ersten Upload
      frameioFolderId: job.frameioFolderId,
      frameioFolderUrl: job.frameioFolderUrl,
      rawFolderId: job.rawFolderId,
      onlineFolderId: job.onlineFolderId,
      parentJobId: job.parentJobId ?? job.id,
      submittedAt: new Date(),
    });
    // Rohmaterial wird nicht kopiert: alle Teile zeigen die Dateien aus dem gemeinsamen Raw-Ordner (lib/queries.ts)
    refresh();
    return { jobId: id, title: newTitle };
  });
}

// ---------- Löschen (nur in To-do) & Stornierung ----------

const DELETABLE = ["entwurf", "todo"];
const CANCELLABLE = ["warteschlange", "in_arbeit", "feedback", "feedback_client"];

// Ganzes Projekt löschen – inkl. Ordner in Frame.io (außer ein Duplikat nutzt ihn noch)
export async function deleteJob(jobId: string) {
  return run(async () => {
    const me = await requireUser("kunde", "admin");
    const job = await getJob(jobId);
    await assertCanSee(me, job);
    if (!DELETABLE.includes(job.status)) {
      throw new Error("Löschen geht nur in „To Dos“. Danach kannst du eine Stornierung anfragen.");
    }
    if (job.frameioFolderId && !(await folderShared(job))) {
      await deleteFolder(job.frameioFolderId).catch(deleteError);
    } else {
      // Ordner wird von anderen Teilen weiter genutzt: dort nachgereichtes Rohmaterial einem anderen Teil zuordnen
      const sibling = (await familyOf(job)).find((j) => j.id !== job.id);
      if (sibling) {
        await db
          .update(jobFiles)
          .set({ jobId: sibling.id })
          .where(and(eq(jobFiles.jobId, jobId), eq(jobFiles.kind, "roh")));
      }
    }
    await db.delete(jobs).where(eq(jobs.id, jobId));
    refresh();
    return null;
  });
}

// Einzelne Rohdatei löschen (nur solange kein Teil in Bearbeitung ist) – verschwindet bei Original und Duplikaten
export async function deleteJobFile(fileRowId: string) {
  return run(async () => {
    const me = await requireUser("kunde", "admin");
    const [file] = await db.select().from(jobFiles).where(eq(jobFiles.id, fileRowId));
    if (!file) throw new Error("Datei nicht gefunden.");
    const job = await getJob(file.jobId);
    await assertCanSee(me, job);
    if (file.kind !== "roh") throw new Error("Nur Rohmaterial kann gelöscht werden.");
    const family = await familyOf(job);
    const busy = family.find((j) => !DELETABLE.includes(j.status));
    if (busy) {
      throw new Error(
        family.length === 1
          ? "Dateien lassen sich nur in „To Dos“ löschen."
          : `„${busy.title}“ nutzt dieses Material schon – löschen geht nicht mehr.`,
      );
    }
    await deleteFile(file.frameioFileId).catch(deleteError);
    // Alle Einträge dieser Datei entfernen (auch ältere Kopien bei Duplikaten)
    await db.delete(jobFiles).where(
      and(
        eq(jobFiles.frameioFileId, file.frameioFileId),
        inArray(
          jobFiles.jobId,
          family.map((j) => j.id),
        ),
      ),
    );
    refresh();
    return null;
  });
}

// Kunde fragt Stornierung an → Cutter wird informiert, Arbeit pausiert, Admins entscheiden
export async function requestCancel(jobId: string, reason: string) {
  return run(async () => {
    const me = await requireUser("kunde", "admin");
    const job = await getJob(jobId);
    await assertCanSee(me, job);
    if (!CANCELLABLE.includes(job.status)) throw new Error("In diesem Status kann keine Stornierung angefragt werden.");
    if (job.cancelRequestedAt) throw new Error("Eine Stornierung ist bereits angefragt.");
    const why = reason.trim();
    await db
      .update(jobs)
      .set({ cancelRequestedAt: new Date(), cancelRequestedBy: me.id, cancelReason: why || null, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
    await notify(
      job,
      me,
      "storno_request",
      `${me.name} möchte „${job.title}“ stornieren – Arbeit bitte pausieren${why ? `. Grund: ${why}` : ""}`,
    );
    refresh();
    return null;
  });
}

// Admin entscheidet: stornieren oder weitermachen
export async function decideCancel(jobId: string, approve: boolean) {
  return run(async () => {
    const me = await requireUser("admin");
    const job = await getJob(jobId);
    if (!job.cancelRequestedAt) throw new Error("Es liegt keine Storno-Anfrage vor.");
    await db
      .update(jobs)
      .set({
        status: approve ? "storniert" : job.status,
        cancelRequestedAt: null,
        cancelRequestedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    await notify(
      job,
      me,
      "storno_decision",
      approve ? `„${job.title}“ wurde storniert.` : `Stornierung von „${job.title}“ abgelehnt – die Arbeit geht weiter.`,
    );
    refresh();
    return null;
  });
}
