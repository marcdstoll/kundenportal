import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { todayVienna } from "@/lib/deadline";
import { logJob, statusChange } from "@/lib/job-log";
import { nameReviewFolder } from "@/lib/review-folder";

// Ready to post und Veröffentlichungsdatum vorbei (ab dem Tag danach) → automatisch Online
export async function autoOnline() {
  const due = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.status, "ready_to_post"), isNotNull(jobs.publishDate), lt(jobs.publishDate, todayVienna())));
  let moved = 0;
  for (const { id } of due) {
    const updated = await db
      .update(jobs)
      .set({ status: "online", updatedAt: new Date() })
      .where(and(eq(jobs.id, id), eq(jobs.status, "ready_to_post")))
      .returning({ id: jobs.id });
    if (!updated.length) continue;
    await logJob(id, "Automatisch online", statusChange("ready_to_post", "online"));
    await nameReviewFolder(id, true);
    moved++;
  }
  if (moved) console.log(`[Auto-Online] ${moved} Projekt(e) auf Online gesetzt`);
  return moved;
}
