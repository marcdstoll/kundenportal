"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { jobs, publications } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { SETTING_KEYS, setSetting } from "@/lib/settings";
import {
  PLATFORM_LABELS,
  PUBLICATION_PLATFORMS,
  parsePublicationUrl,
  type PublicationPlatform,
} from "@/lib/publications";
import { newPublicationId, runViewSync, type SyncResult } from "@/lib/view-sync";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

// Veröffentlichungs-Links eines Projekts speichern (nur Admins). Leeres Feld = Link entfernen.
// Neue YouTube-Links werden direkt abgerufen, damit die Views gleich sichtbar sind.
export async function savePublications(
  jobId: string,
  links: Partial<Record<PublicationPlatform, string>>,
): Promise<Result<{ updated: number; failed: number }>> {
  await requireUser("admin");
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId));
  if (!job) return { ok: false, error: "Projekt nicht gefunden." };

  // Erst alles prüfen, dann speichern
  const parsed = new Map<PublicationPlatform, { url: string; externalId: string } | null>();
  for (const platform of PUBLICATION_PLATFORMS) {
    const raw = (links[platform] ?? "").trim();
    if (!raw) {
      parsed.set(platform, null);
      continue;
    }
    if (raw.length > 500) return { ok: false, error: `${PLATFORM_LABELS[platform]}: Link ist zu lang.` };
    const p = parsePublicationUrl(platform, raw);
    if (!p) {
      const hint =
        platform === "tiktok"
          ? " Bitte den vollständigen Link mit „/video/…“ verwenden (Kurzlinks wie vm.tiktok.com gehen nicht)."
          : "";
      return { ok: false, error: `${PLATFORM_LABELS[platform]}: Das ist kein gültiger Video-Link.${hint}` };
    }
    parsed.set(platform, p);
  }

  const existing = await db.select().from(publications).where(eq(publications.jobId, jobId));
  for (const platform of PUBLICATION_PLATFORMS) {
    const next = parsed.get(platform);
    const old = existing.find((e) => e.platform === platform);
    if (!next) {
      if (old) await db.delete(publications).where(eq(publications.id, old.id));
      continue;
    }
    if (old && old.externalId === next.externalId) {
      if (old.url !== next.url) await db.update(publications).set({ url: next.url }).where(eq(publications.id, old.id));
      continue;
    }
    // Neues bzw. anderes Video: alter Stand gehört nicht mehr dazu
    if (old) await db.delete(publications).where(eq(publications.id, old.id));
    await db.insert(publications).values({ id: newPublicationId(), jobId, platform, ...next });
  }

  const sync = await runViewSync("link", jobId);
  refresh();
  return { ok: true, data: { updated: sync.updated, failed: sync.failed } };
}

// Abruf von Hand starten (Einstellungen)
export async function runViewSyncNow(): Promise<SyncResult> {
  await requireUser("admin");
  const result = await runViewSync("manual");
  refresh();
  return result;
}

// Hall of Fame für Cutter freigeben oder wieder verbergen
export async function setHallOfFameForCutters(on: boolean) {
  await requireUser("admin");
  await setSetting(SETTING_KEYS.hallOfFameCutter, on ? "1" : null);
  refresh();
}
