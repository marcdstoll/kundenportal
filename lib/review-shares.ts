import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { customers, jobs } from "@/db/schema";
import { createShare } from "@/lib/frameio";

// Review-Links als öffentliche Frame.io-Shares (Kunden haben keinen Frame.io-Zugang).
// Ein Share pro Projekt auf dessen Review-Ordner – neue Versionen erscheinen darin automatisch.

type Job = typeof jobs.$inferSelect;

// Share anlegen (falls noch keiner da ist) und Link liefern; klappt es nicht, null (bisheriger Link bleibt)
export async function ensureReviewShare(job: Job): Promise<string | null> {
  if (job.reviewShareUrl) return job.reviewShareUrl;
  if (!job.reviewFolderId) return null;
  try {
    const [c] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, job.customerId));
    const share = await createShare(job.reviewFolderId, `${c?.name ?? ""} – ${job.title}`);
    await db.update(jobs).set({ reviewShareId: share.id, reviewShareUrl: share.url }).where(eq(jobs.id, job.id));
    return share.url;
  } catch (e) {
    console.error("[Frame.io] Share-Link nicht angelegt:", e);
    return null;
  }
}

// Interne Frame.io-Ansichtslinks (nur mit Login im Projekt) – werden durch den Share ersetzt.
// Von Hand eingetragene andere Links (YouTube, Drive …) bleiben.
const isInternalFrameioLink = (url: string | null) => {
  if (!url) return true;
  try {
    const host = new URL(url).hostname;
    return host === "frame.io" || host.endsWith(".frame.io");
  } catch {
    return false;
  }
};

// Bestehende Projekte nachrüsten – Frame.io erlaubt 10 Shares pro Minute, daher in kleinen Portionen.
// Fehlgeschlagene werden markiert (review_share_id = FAILED) und übersprungen; retryFailed versucht sie erneut.
export const SHARE_BATCH = 8;
const FAILED = "fehler";
const missing = and(isNotNull(jobs.reviewFolderId), isNull(jobs.reviewShareUrl), ne(jobs.status, "storniert"));
export async function backfillReviewShares(limit = SHARE_BATCH, retryFailed = false) {
  if (retryFailed) await db.update(jobs).set({ reviewShareId: null }).where(and(missing, eq(jobs.reviewShareId, FAILED)));
  const pending = await db
    .select()
    .from(jobs)
    .where(and(missing, isNull(jobs.reviewShareId)))
    .orderBy(asc(jobs.createdAt));
  let done = 0;
  let failed = 0;
  for (const job of pending.slice(0, limit)) {
    const url = await ensureReviewShare(job);
    if (!url) {
      await db.update(jobs).set({ reviewShareId: FAILED }).where(eq(jobs.id, job.id));
      failed++;
      continue;
    }
    if (isInternalFrameioLink(job.reviewUrl)) {
      await db.update(jobs).set({ reviewUrl: url }).where(eq(jobs.id, job.id));
    }
    done++;
  }
  return { done, failed, remaining: Math.max(0, pending.length - done - failed) };
}

// Noch ohne Share (inkl. fehlgeschlagener)
export async function countMissingReviewShares() {
  return (await db.select({ id: jobs.id }).from(jobs).where(missing)).length;
}
