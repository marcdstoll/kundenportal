import { and, eq, inArray, notExists } from "drizzle-orm";
import { db } from "@/db";
import { jobCutters, jobs } from "@/db/schema";
import { logJob, statusChange } from "@/lib/job-log";

// Ohne Cutter kann niemand weiterarbeiten → Projekte in Warteschlange / In Arbeit gehen zurück auf To Do
const WORKING = ["warteschlange", "in_arbeit"];

export async function backToTodoIfNoCutter(jobIds: string[]) {
  if (jobIds.length === 0) return;
  const candidates = await db
    .select({ id: jobs.id, status: jobs.status })
    .from(jobs)
    .where(
      and(
        inArray(jobs.id, jobIds),
        inArray(jobs.status, WORKING),
        notExists(db.select().from(jobCutters).where(eq(jobCutters.jobId, jobs.id))),
      ),
    );
  for (const j of candidates) {
    const moved = await db
      .update(jobs)
      .set({ status: "todo", updatedAt: new Date() })
      .where(and(eq(jobs.id, j.id), eq(jobs.status, j.status)))
      .returning({ id: jobs.id });
    if (moved.length) await logJob(j.id, "Kein Cutter mehr", statusChange(j.status, "todo"));
  }
}
