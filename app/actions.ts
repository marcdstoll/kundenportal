"use server";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { jobCutters, jobFiles, jobs, user } from "@/db/schema";
import { createJobFolder, createUpload } from "@/lib/frameio";
import { requireUser } from "@/lib/session";
import { FORMATS, STATUSES } from "@/lib/status";

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
async function changeStatus(
  jobId: string,
  from: string,
  to: string,
  extra: Partial<typeof jobs.$inferInsert> = {}
) {
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

// ---------- Client: Projekt anlegen und hochladen ----------

export type NewJobInput = {
  title: string;
  format: string;
  platform: string;
  videoLength: string;
  content: string;
  specialNotes: string;
  customerId?: string; // nur Admins: Projekt für einen Client anlegen
};

// Schritt 1: Projekt als Entwurf anlegen, inkl. Ordner in Frame.io
export async function createJob(input: NewJobInput) {
  return run(async () => {
    const me = await requireUser("kunde", "admin");

    const required = [
      input.title,
      input.platform,
      input.videoLength,
      input.content,
      input.specialNotes,
    ].map((v) => v.trim());
    if (required.some((v) => v.length === 0)) {
      throw new Error("Bitte alle Pflichtfelder ausfüllen.");
    }
    if (!FORMATS.some((f) => f.value === input.format)) {
      throw new Error("Bitte ein Format auswählen.");
    }

    // Für wen ist das Projekt? Kunden immer für sich selbst, Admins wahlweise für einen Client
    let customer = { id: me.id, name: me.name };
    if (me.role === "admin" && input.customerId) {
      const [c] = await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(and(eq(user.id, input.customerId), eq(user.role, "kunde")));
      if (!c) throw new Error("Client nicht gefunden.");
      customer = c;
    }

    const folder = await createJobFolder(`${customer.name} – ${input.title.trim()}`);
    const id = randomUUID();
    await db.insert(jobs).values({
      id,
      customerId: customer.id,
      title: input.title.trim(),
      format: input.format,
      platform: input.platform.trim(),
      videoLength: input.videoLength.trim(),
      content: input.content.trim(),
      specialNotes: input.specialNotes.trim(),
      status: "entwurf",
      frameioFolderId: folder.id,
      frameioFolderUrl: folder.url,
    });
    return { jobId: id };
  });
}

// Upload-Links für eine Datei holen
// "roh": Rohmaterial (nur im Entwurf, vom Ersteller)
// "fertig": fertiges Video (vom zugeordneten Cutter, während "Wird jetzt gemacht")
export async function requestUpload(
  jobId: string,
  kind: "roh" | "fertig",
  file: { name: string; size: number }
) {
  return run(async () => {
    const me = await requireUser();
    const job = await getJob(jobId);

    if (kind === "roh") {
      const allowed = job.customerId === me.id || me.role === "admin";
      if (!allowed) throw new Error("Keine Berechtigung.");
      if (job.status !== "entwurf") throw new Error("Projekt wurde bereits abgeschickt.");
    } else {
      await requireCutterOf(jobId);
      if (job.status !== "in_arbeit") {
        throw new Error("Hochladen geht nur, solange das Projekt in Arbeit ist.");
      }
    }

    const upload = await createUpload(job.frameioFolderId!, file.name, file.size);
    const id = randomUUID();
    await db.insert(jobFiles).values({
      id,
      jobId,
      kind,
      name: file.name,
      size: file.size,
      frameioFileId: upload.fileId,
      frameioUrl: upload.viewUrl,
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
    const allowed =
      me.role === "admin" || job.customerId === me.id || (await isCutterOf(job.id, me.id));
    if (!allowed) throw new Error("Keine Berechtigung.");
    await db.update(jobFiles).set({ uploaded: true }).where(eq(jobFiles.id, fileRowId));
    return null;
  });
}

// Schritt 3: Projekt abschicken → erscheint bei den Cuttern in "To Dos"
export async function submitJob(jobId: string) {
  return run(async () => {
    const me = await requireUser();
    const job = await getJob(jobId);
    if (job.customerId !== me.id && me.role !== "admin") throw new Error("Keine Berechtigung.");
    const files = await db
      .select({ id: jobFiles.id })
      .from(jobFiles)
      .where(and(eq(jobFiles.jobId, jobId), eq(jobFiles.kind, "roh"), eq(jobFiles.uploaded, true)));
    if (files.length === 0) throw new Error("Bitte mindestens eine Datei hochladen.");
    await changeStatus(jobId, "entwurf", "todo");
    return null;
  });
}

// ---------- Cutter ----------

// To Dos → Warteschlange: Projekt übernehmen
export async function claimJob(jobId: string) {
  return run(async () => {
    const me = await requireUser("cutter", "admin");
    await changeStatus(jobId, "todo", "warteschlange");
    await addCutterRow(jobId, me.id);
    refresh();
    return null;
  });
}

// Warteschlange → Wird jetzt gemacht
export async function startJob(jobId: string) {
  return run(async () => {
    await requireCutterOf(jobId);
    await changeStatus(jobId, "warteschlange", "in_arbeit");
    refresh();
    return null;
  });
}

// Wird jetzt gemacht → Wartet auf Feedback
// Mit Link: Cutter fügt einen vorhandenen Review-Link ein.
// Ohne Link: der Link des zuletzt in der App hochgeladenen fertigen Videos wird genommen.
export async function submitForReview(jobId: string, reviewUrl?: string) {
  return run(async () => {
    await requireCutterOf(jobId);
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
    await changeStatus(jobId, "in_arbeit", "feedback", { reviewUrl: url, feedbackNote: null });
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

// ---------- Admin ----------

// Wartet auf Feedback → Complete
export async function approveJob(jobId: string) {
  return run(async () => {
    await requireUser("admin");
    await changeStatus(jobId, "feedback", "complete", { feedbackNote: null });
    refresh();
    return null;
  });
}

// Wartet auf Feedback → zurück in die Warteschlange, mit Hinweis für den Cutter
export async function rejectJob(jobId: string, note: string) {
  return run(async () => {
    await requireUser("admin");
    if (note.trim().length === 0) throw new Error("Bitte einen Hinweis für den Cutter angeben.");
    await changeStatus(jobId, "feedback", "warteschlange", { feedbackNote: note.trim() });
    refresh();
    return null;
  });
}

// Status frei setzen (z. B. Ready to post, Online, Storniert)
export async function setStatus(jobId: string, status: string) {
  return run(async () => {
    await requireUser("admin");
    if (!(STATUSES as readonly string[]).includes(status)) throw new Error("Unbekannter Status.");
    await db.update(jobs).set({ status, updatedAt: new Date() }).where(eq(jobs.id, jobId));
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
export async function setBilled(jobId: string, billed: boolean) {
  return run(async () => {
    await requireUser("admin");
    await db.update(jobs).set({ billed }).where(eq(jobs.id, jobId));
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
    await db.update(jobs).set({ reviewUrl: url || null }).where(eq(jobs.id, jobId));
    refresh();
    return null;
  });
}

export async function removeCutter(jobId: string, cutterId: string) {
  return run(async () => {
    await requireUser("admin");
    await db
      .delete(jobCutters)
      .where(and(eq(jobCutters.jobId, jobId), eq(jobCutters.userId, cutterId)));
    refresh();
    return null;
  });
}
