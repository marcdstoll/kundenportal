"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { profiles, user } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { isColor } from "@/lib/colors";

// Persönliche Farbe setzen: jeder für sich selbst, Admins für alle. null = wieder automatisch
export async function setPersonColor(userId: string, color: string | null) {
  try {
    const me = await requireUser();
    if (me.id !== userId && me.role !== "admin") throw new Error("Keine Berechtigung.");
    if (color !== null && !isColor(color)) throw new Error("Ungültige Farbe.");
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
    if (!u) throw new Error("Nutzer nicht gefunden.");
    const value = color?.toLowerCase() ?? null;
    await db
      .insert(profiles)
      .values({ userId, color: value })
      .onConflictDoUpdate({ target: profiles.userId, set: { color: value } }); // updatedAt bleibt: steuert die Logo-Version
    refresh();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Unbekannter Fehler" };
  }
}
