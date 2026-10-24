import { randomUUID } from "crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, publicationViews, publications, settings } from "@/db/schema";
import { getSetting, setSetting } from "@/lib/settings";
import { PLATFORM_LABELS, type PublicationPlatform } from "@/lib/publications";

// Täglicher Views-Abruf für die Hall of Fame.
// Coolify ruft /api/cron/views stündlich auf; gearbeitet wird genau einmal pro Tag – beim ersten Aufruf
// nach 00:00 Uhr in der eingestellten Zeitzone (Standard Europe/Vienna, änderbar über VIEWS_TIMEZONE).
// Zähler werden nie auf 0 gesetzt: bei Fehlern bleibt der letzte bekannte Stand stehen.

export const VIEWS_TIMEZONE = process.env.VIEWS_TIMEZONE || "Europe/Vienna";
const LAST_DAY = "views_last_day";
const LAST_RUN = "views_last_run";
const LOCK = "views_lock";

export type SyncTrigger = "cron" | "manual" | "link";
export type SyncResult = {
  trigger: SyncTrigger;
  startedAt: string;
  finishedAt: string;
  total: number;
  updated: number;
  failed: number;
  skipped: number;
  error: string | null;
};

// Kalendertag in der eingestellten Zeitzone, z. B. "2026-10-24"
export function dayInZone(d = new Date(), timeZone = VIEWS_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export async function lastSyncRun(): Promise<SyncResult | null> {
  const raw = await getSetting(LAST_RUN);
  try {
    return raw ? (JSON.parse(raw) as SyncResult) : null;
  } catch {
    return null;
  }
}

// ---------- Abruf je Plattform ----------

type FetchResult = { views: Map<string, number>; error: string | null };

async function fetchYouTube(ids: string[]): Promise<FetchResult> {
  const views = new Map<string, number>();
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { views, error: "YOUTUBE_API_KEY ist nicht gesetzt." };
  const base = process.env.YOUTUBE_API_URL || "https://www.googleapis.com/youtube/v3";
  // Bis zu 50 Videos pro Anfrage – kostet jeweils nur 1 Einheit vom Tageskontingent
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = `${base}/videos?part=statistics&id=${chunk.map(encodeURIComponent).join(",")}&key=${encodeURIComponent(key)}`;
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const body = (await res.json().catch(() => ({}))) as {
        items?: { id: string; statistics?: { viewCount?: string } }[];
        error?: { message?: string };
      };
      if (!res.ok) return { views, error: body.error?.message || `HTTP ${res.status}` };
      for (const item of body.items ?? []) {
        const n = Number(item.statistics?.viewCount);
        if (Number.isFinite(n)) views.set(item.id, n);
      }
    } catch (e) {
      return { views, error: e instanceof Error ? e.message : "Verbindung fehlgeschlagen" };
    }
  }
  return { views, error: null };
}

// TikTok und Instagram folgen (Apify) – bis dahin werden die Links gespeichert, aber nicht abgerufen
const NOT_CONNECTED = "Abruf noch nicht angebunden (folgt über Apify).";

async function fetchPlatform(platform: PublicationPlatform, ids: string[]): Promise<FetchResult | null> {
  if (platform === "youtube") return fetchYouTube(ids);
  return null;
}

// ---------- Sperre gegen doppelte Läufe ----------

async function acquireLock(): Promise<boolean> {
  await db.insert(settings).values({ key: LOCK, value: null }).onConflictDoNothing();
  const rows = await db
    .update(settings)
    .set({ value: new Date().toISOString(), updatedAt: new Date() })
    .where(
      and(
        eq(settings.key, LOCK),
        sql`(${settings.value} is null or ${settings.value}::timestamptz < now() - interval '15 minutes')`,
      ),
    )
    .returning({ key: settings.key });
  return rows.length > 0;
}

async function releaseLock() {
  await db.update(settings).set({ value: null, updatedAt: new Date() }).where(eq(settings.key, LOCK));
}

// ---------- Lauf ----------

// Views für alle Veröffentlichungen abrufen (oder nur für die eines Projekts, z. B. direkt nach dem Speichern der Links)
export async function runViewSync(trigger: SyncTrigger, onlyJobId?: string): Promise<SyncResult> {
  const startedAt = new Date();
  const result: SyncResult = {
    trigger,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    total: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    error: null,
  };

  const locked = !onlyJobId;
  if (locked && !(await acquireLock())) {
    return { ...result, error: "Ein Abruf läuft bereits – bitte in ein paar Minuten erneut versuchen." };
  }

  try {
    const rows = await db
      .select({ id: publications.id, platform: publications.platform, externalId: publications.externalId })
      .from(publications)
      .innerJoin(jobs, eq(jobs.id, publications.jobId))
      .where(and(ne(jobs.status, "storniert"), onlyJobId ? eq(publications.jobId, onlyJobId) : undefined));
    result.total = rows.length;
    const day = dayInZone(startedAt);
    const errors: string[] = [];

    for (const platform of ["youtube", "tiktok", "instagram"] as PublicationPlatform[]) {
      const pubs = rows.filter((r) => r.platform === platform && r.externalId);
      if (pubs.length === 0) continue;
      const fetched = await fetchPlatform(platform, [...new Set(pubs.map((p) => p.externalId!))]);

      if (!fetched) {
        result.skipped += pubs.length;
        await db
          .update(publications)
          .set({ lastError: NOT_CONNECTED })
          .where(
            inArray(
              publications.id,
              pubs.map((p) => p.id),
            ),
          );
        continue;
      }

      const now = new Date();
      for (const p of pubs) {
        const views = fetched.views.get(p.externalId!);
        if (views !== undefined) {
          result.updated++;
          await db
            .update(publications)
            .set({ views, viewsAt: now, checkedAt: now, lastError: null })
            .where(eq(publications.id, p.id));
          await db
            .insert(publicationViews)
            .values({ publicationId: p.id, day, views, fetchedAt: now })
            .onConflictDoUpdate({
              target: [publicationViews.publicationId, publicationViews.day],
              set: { views, fetchedAt: now },
            });
        } else {
          result.failed++;
          const msg = fetched.error
            ? `${PLATFORM_LABELS[platform]}: ${fetched.error}`
            : "Video nicht gefunden (gelöscht, privat oder Link falsch).";
          await db.update(publications).set({ checkedAt: now, lastError: msg }).where(eq(publications.id, p.id));
        }
      }
      if (fetched.error) errors.push(`${PLATFORM_LABELS[platform]}: ${fetched.error}`);
    }

    result.error = errors.length ? errors.join(" · ") : null;
    result.finishedAt = new Date().toISOString();
    if (!onlyJobId) {
      await setSetting(LAST_RUN, JSON.stringify(result));
      // Tageslauf gilt als erledigt, wenn die Plattform erreichbar war (sonst nächste Stunde erneut)
      if (!result.error) await setSetting(LAST_DAY, day);
    }
    return result;
  } catch (e) {
    result.error = e instanceof Error ? e.message : "Unbekannter Fehler";
    result.finishedAt = new Date().toISOString();
    if (!onlyJobId) await setSetting(LAST_RUN, JSON.stringify(result));
    return result;
  } finally {
    if (locked) await releaseLock();
  }
}

// Für den stündlichen Cron-Aufruf: nur laufen, wenn heute (Wiener Zeit) noch kein erfolgreicher Lauf war
export async function runDailyViewSyncIfDue(now = new Date()) {
  const today = dayInZone(now);
  if ((await getSetting(LAST_DAY)) === today) return { ran: false as const, day: today };
  return { ran: true as const, day: today, result: await runViewSync("cron") };
}

export function newPublicationId() {
  return randomUUID();
}
