import { and, asc, desc, eq, inArray, ne, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { jobCutters, jobFiles, jobs, user } from "@/db/schema";

export type JobView = typeof jobs.$inferSelect & {
  customerName: string;
  cutters: { id: string; name: string }[];
  files: (typeof jobFiles.$inferSelect)[];
};

// Projekte inkl. Client-Name, Cuttern und hochgeladenen Dateien laden
export async function loadJobs(filter?: SQL): Promise<JobView[]> {
  const rows = await db
    .select({ job: jobs, customerName: user.name })
    .from(jobs)
    .innerJoin(user, eq(jobs.customerId, user.id))
    .where(filter ? and(ne(jobs.status, "entwurf"), filter) : ne(jobs.status, "entwurf"))
    .orderBy(desc(jobs.updatedAt));

  const ids = rows.map((r) => r.job.id);
  if (ids.length === 0) return [];

  const [cutterRows, fileRows] = await Promise.all([
    db
      .select({ jobId: jobCutters.jobId, id: user.id, name: user.name })
      .from(jobCutters)
      .innerJoin(user, eq(jobCutters.userId, user.id))
      .where(inArray(jobCutters.jobId, ids))
      .orderBy(asc(jobCutters.createdAt)),
    db
      .select()
      .from(jobFiles)
      .where(and(inArray(jobFiles.jobId, ids), eq(jobFiles.uploaded, true)))
      .orderBy(asc(jobFiles.createdAt)),
  ]);

  return rows.map(({ job, customerName }) => ({
    ...job,
    customerName,
    cutters: cutterRows
      .filter((c) => c.jobId === job.id)
      .map((c) => ({ id: c.id, name: c.name })),
    files: fileRows.filter((f) => f.jobId === job.id),
  }));
}

export async function loadJob(id: string) {
  const [job] = await loadJobs(eq(jobs.id, id));
  return job ?? null;
}

// Projekte, an denen ein bestimmter Cutter beteiligt ist
export async function loadJobsOfCutter(cutterId: string) {
  const links = await db
    .select({ jobId: jobCutters.jobId })
    .from(jobCutters)
    .where(eq(jobCutters.userId, cutterId));
  if (links.length === 0) return [];
  return loadJobs(inArray(jobs.id, links.map((l) => l.jobId)));
}

export async function listUsers(...roles: ("kunde" | "cutter" | "admin")[]) {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
    })
    .from(user)
    .where(inArray(user.role, roles))
    .orderBy(asc(user.name));
}
