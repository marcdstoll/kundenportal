import { and, eq, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { jobFiles, jobs } from "@/db/schema";
import { deleteFile, deleteFolder } from "@/lib/frameio";

// Abgebrochene Uploads aufräumen (läuft regelmäßig über /api/cron/cleanup).
// Ein Upload gilt als abgebrochen, wenn sich der Browser so lange nicht gemeldet hat:
export const STALE_MINUTES = 30;

export async function cleanupStaleUploads() {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
  const result = { drafts: 0, files: 0, errors: 0 };

  // 1. Nie fertig abgeschickte Projekte (Entwurf) samt Frame.io-Ordner löschen
  const drafts = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "entwurf"), lt(jobs.updatedAt, cutoff)));
  for (const job of drafts) {
    try {
      if (job.frameioFolderId) {
        const sharing = await db
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.frameioFolderId, job.frameioFolderId), ne(jobs.id, job.id)));
        if (sharing.length === 0) await deleteFolder(job.frameioFolderId);
      }
      await db.delete(jobs).where(eq(jobs.id, job.id));
      result.drafts++;
    } catch (e) {
      console.error(`[Aufräumen] Entwurf ${job.id} nicht gelöscht:`, e);
      result.errors++;
    }
  }

  // 2. Halb hochgeladene Dateien in bestehenden Projekten (abgebrochenes Nachreichen) entfernen
  const stale = await db
    .select({ file: jobFiles })
    .from(jobFiles)
    .innerJoin(jobs, eq(jobFiles.jobId, jobs.id))
    .where(and(eq(jobFiles.uploaded, false), lt(jobFiles.createdAt, cutoff), lt(jobs.updatedAt, cutoff)));
  for (const { file } of stale) {
    try {
      await deleteFile(file.frameioFileId);
      await db.delete(jobFiles).where(eq(jobFiles.id, file.id));
      result.files++;
    } catch (e) {
      console.error(`[Aufräumen] Datei ${file.id} nicht gelöscht:`, e);
      result.errors++;
    }
  }

  if (result.drafts || result.files || result.errors) console.log("[Aufräumen]", result);
  return result;
}
