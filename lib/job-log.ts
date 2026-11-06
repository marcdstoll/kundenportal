import { randomUUID } from "crypto";
import { db } from "@/db";
import { jobEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { STATUS_LABELS } from "@/lib/status";

// Projekt-Historie: einen Schritt protokollieren (Person = angemeldeter Nutzer, außer actorId ist angegeben).
// Fehler beim Protokollieren dürfen die eigentliche Aktion nie scheitern lassen.
export async function logJob(jobId: string, action: string, detail?: string | null, actorId?: string | null) {
  try {
    const actor = actorId !== undefined ? actorId : ((await getCurrentUser())?.id ?? null);
    await db.insert(jobEvents).values({ id: randomUUID(), jobId, actorId: actor, action, detail: detail || null });
  } catch (e) {
    console.error("[Historie] nicht gespeichert:", e);
  }
}

export const statusChange = (from: string, to: string) =>
  `${STATUS_LABELS[from] ?? from} → ${STATUS_LABELS[to] ?? to}`;
