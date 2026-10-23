"use server";

import { sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { cleanFilters, isFilterView } from "@/lib/view-filters";

// Filter einer Ansicht für den angemeldeten Nutzer speichern (nur die übergebenen Werte ändern sich).
// Ändert bewusst nicht updatedAt – das steuert nur, wann Profilbilder neu geladen werden.
export async function saveViewFilter(view: string, patch: Record<string, string>) {
  const me = await requireUser();
  if (!isFilterView(view)) return;
  const clean = cleanFilters(view, patch);
  if (Object.keys(clean).length === 0) return;
  const value = JSON.stringify({ [view]: clean });
  await db
    .insert(profiles)
    .values({ userId: me.id, viewFilters: { [view]: clean } })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        viewFilters: sql`jsonb_set(
          ${profiles.viewFilters},
          ${`{${view}}`}::text[],
          coalesce(${profiles.viewFilters} -> ${view}, '{}'::jsonb) || (${value}::jsonb -> ${view})
        )`,
      },
    });
  refresh();
}
