"use server";

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { jobFiles, jobs } from "@/db/schema";
import { createJobFolder, createUpload } from "@/lib/frameio";
import { requireUser } from "@/lib/session";

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
  if (!job) throw new Error("Auftrag nicht gefunden.");
  return job;
}

// Status nur ändern, wenn der Auftrag noch im erwarteten Status ist
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
    throw new Error("Der Auftrag wurde inzwischen geändert. Bitte Seite neu laden.");
  }
}

// ---------- Kunde ----------

export type NewJobInput = {
  title: string;
  platform: string;
  videoLength: string;
  content: string;
  specialNotes: string;
};

// Schritt 1: Auftrag als Entwurf anlegen, inkl. Ordner in Frame.io
export async function createJob(input: NewJobInput) {
  return run(async () => {
    const user = await requireUser("kunde", "admin");

    const fields = Object.values(input).map((v) => v.trim());
    if (fields.some((v) => v.length === 0)) {
      throw new Error("Bitte alle Pflichtfelder ausfüllen.");
    }

    const folder = await createJobFolder(`${user.name} – ${input.title.trim()}`);
    const id = randomUUID();
    await db.insert(jobs).values({
      id,
      customerId: user.id,
      title: input.title.trim(),
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
// "roh": Kunde lädt Material hoch (nur im Entwurf)
// "fertig": Cutter lädt das fertige Video hoch (nur in Bearbeitung)
export async function requestUpload(
  jobId: string,
  kind: "roh" | "fertig",
  file: { name: string; size: number }
) {
  return run(async () => {
    const user = await requireUser();
    const job = await getJob(jobId);

    if (kind === "roh") {
      if (job.customerId !== user.id) throw new Error("Keine Berechtigung.");
      if (job.status !== "entwurf") throw new Error("Auftrag wurde bereits abgeschickt.");
    } else {
      if (job.cutterId !== user.id) throw new Error("Nur der zuständige Cutter darf hochladen.");
      if (job.status !== "in_bearbeitung") throw new Error("Auftrag ist nicht in Bearbeitung.");
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
    const user = await requireUser();
    const [file] = await db.select().from(jobFiles).where(eq(jobFiles.id, fileRowId));
    if (!file) throw new Error("Datei nicht gefunden.");
    const job = await getJob(file.jobId);
    if (job.customerId !== user.id && job.cutterId !== user.id) {
      throw new Error("Keine Berechtigung.");
    }
    await db.update(jobFiles).set({ uploaded: true }).where(eq(jobFiles.id, fileRowId));
    return null;
  });
}

async function countUploaded(jobId: string, kind: "roh" | "fertig") {
  const files = await db
    .select({ id: jobFiles.id })
    .from(jobFiles)
    .where(and(eq(jobFiles.jobId, jobId), eq(jobFiles.kind, kind), eq(jobFiles.uploaded, true)));
  return files.length;
}

// Schritt 3: Auftrag abschicken → erscheint bei den Cuttern in "ToDo"
export async function submitJob(jobId: string) {
  return run(async () => {
    const user = await requireUser();
    const job = await getJob(jobId);
    if (job.customerId !== user.id) throw new Error("Keine Berechtigung.");
    if ((await countUploaded(jobId, "roh")) === 0) {
      throw new Error("Bitte mindestens eine Datei hochladen.");
    }
    await changeStatus(jobId, "entwurf", "todo");
    return null;
  });
}

// ---------- Cutter ----------

// ToDo → Warteschlange: Auftrag übernehmen
export async function claimJob(jobId: string) {
  return run(async () => {
    const user = await requireUser("cutter", "admin");
    await changeStatus(jobId, "todo", "warteschlange", { cutterId: user.id });
    refresh();
    return null;
  });
}

// Warteschlange → In Bearbeitung
export async function startJob(jobId: string) {
  return run(async () => {
    const user = await requireUser("cutter", "admin");
    const job = await getJob(jobId);
    if (job.cutterId !== user.id) throw new Error("Nur der zuständige Cutter.");
    await changeStatus(jobId, "warteschlange", "in_bearbeitung");
    refresh();
    return null;
  });
}

// In Bearbeitung → Feedback (nach dem Upload des fertigen Videos)
export async function finishJob(jobId: string) {
  return run(async () => {
    const user = await requireUser("cutter", "admin");
    const job = await getJob(jobId);
    if (job.cutterId !== user.id) throw new Error("Nur der zuständige Cutter.");
    if ((await countUploaded(jobId, "fertig")) === 0) {
      throw new Error("Bitte zuerst das fertige Video hochladen.");
    }
    await changeStatus(jobId, "in_bearbeitung", "feedback", { feedbackNote: null });
    return null;
  });
}

// ---------- Admin ----------

// Feedback → Abgeschlossen
export async function approveJob(jobId: string) {
  return run(async () => {
    await requireUser("admin");
    await changeStatus(jobId, "feedback", "abgeschlossen");
    refresh();
    return null;
  });
}

// Feedback → zurück in Bearbeitung, mit Hinweis für den Cutter
export async function returnJob(jobId: string, note: string) {
  return run(async () => {
    await requireUser("admin");
    if (note.trim().length === 0) throw new Error("Bitte einen Hinweis für den Cutter angeben.");
    await changeStatus(jobId, "feedback", "in_bearbeitung", { feedbackNote: note.trim() });
    refresh();
    return null;
  });
}
