import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { renameFolder } from "@/lib/frameio";

// Beim Status "Online" heißt der Review-Ordner "Online" (bei Duplikaten mit Titel), sonst wieder "ToBeReviewed".
export async function nameReviewFolder(jobId: string, online: boolean) {
  try {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job?.reviewFolderId) return;
    const base = online ? "Online" : "ToBeReviewed";
    let shared = !!job.parentJobId;
    if (!shared && job.frameioFolderId) {
      const others = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.frameioFolderId, job.frameioFolderId), ne(jobs.id, job.id)));
      shared = others.length > 0;
    }
    await renameFolder(job.reviewFolderId, shared ? `${base} – ${job.title}` : base);
  } catch (e) {
    console.error("Review-Ordner konnte nicht umbenannt werden:", e);
  }
}
