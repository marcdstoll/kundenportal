import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cutterClients, jobCutters, jobs } from "@/db/schema";

// Wer sieht welche Projekte?
// - Admin: alles
// - Cutter: Projekte der für ihn freigegebenen Kunden + Projekte, denen er direkt zugeordnet ist
// - Kunde: nur die eigenen
type Viewer = { id: string; role: string };

// Kunden, die ein Cutter betreut
export async function clientIdsOfCutter(cutterId: string) {
  const rows = await db.select({ id: cutterClients.clientId }).from(cutterClients).where(eq(cutterClients.cutterId, cutterId));
  return rows.map((r) => r.id);
}

// Filter für Projekt-Abfragen (undefined = keine Einschränkung)
export async function jobScope(me: Viewer): Promise<SQL | undefined> {
  if (me.role === "admin") return undefined;
  if (me.role === "kunde") return eq(jobs.customerId, me.id);
  const [clients, assigned] = await Promise.all([
    clientIdsOfCutter(me.id),
    db.select({ id: jobCutters.jobId }).from(jobCutters).where(eq(jobCutters.userId, me.id)),
  ]);
  const parts: SQL[] = [];
  if (clients.length) parts.push(inArray(jobs.customerId, clients));
  if (assigned.length)
    parts.push(
      inArray(
        jobs.id,
        assigned.map((a) => a.id),
      ),
    );
  // Nichts freigegeben → nichts sehen
  return parts.length ? or(...parts) : eq(jobs.id, "__keine_freigabe__");
}

// Zwei Filter kombinieren (einer darf fehlen)
export function both(a: SQL | undefined, b: SQL | undefined) {
  return a && b ? and(a, b) : (a ?? b);
}

// Darf dieser Nutzer genau dieses Projekt sehen?
export async function canSeeJob(me: Viewer, job: { id: string; customerId: string }) {
  if (me.role === "admin") return true;
  if (me.role === "kunde") return job.customerId === me.id;
  const [freigabe] = await db
    .select({ id: cutterClients.clientId })
    .from(cutterClients)
    .where(and(eq(cutterClients.cutterId, me.id), eq(cutterClients.clientId, job.customerId)));
  if (freigabe) return true;
  const [assigned] = await db
    .select({ id: jobCutters.jobId })
    .from(jobCutters)
    .where(and(eq(jobCutters.jobId, job.id), eq(jobCutters.userId, me.id)));
  return !!assigned;
}
