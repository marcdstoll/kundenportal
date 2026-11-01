import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { jobCutters, jobs, publications, user } from "@/db/schema";
import { DISCIPLINES, PUBLICATION_PLATFORMS, type Discipline, type PublicationPlatform } from "@/lib/publications";
import { todayVienna } from "@/lib/deadline";

// Hall of Fame je Client und Disziplin (siehe Briefing 04, Punkt 2):
//   Gesamtviews je Cutter = Summe der Views seiner Videos (Video = Summe aller Plattform-Views)
//   Ø Views pro Video     = Gesamtviews / Anzahl berücksichtigter Videos
// Berücksichtigt wird ein Video, sobald mindestens eine Veröffentlichung einen Views-Stand hat.
// Mehrere Cutter an einem Video: jeder bekommt das Video voll angerechnet (Regel noch offen).
// Zeitraum: „7“/„30“ = nur Videos, deren Veröffentlichungsdatum in den letzten 7 bzw. 30 Tagen liegt (inkl. heute).

export const HOF_PERIODS = { all: "Gesamt", "7": "Letzte 7 Tage", "30": "Letzte 30 Tage" } as const;
export type HofPeriod = keyof typeof HOF_PERIODS;
// Feste Reihenfolge (Objekt-Schlüssel wie „7“ würde JavaScript sonst nach vorn sortieren)
export const HOF_PERIOD_ORDER: HofPeriod[] = ["all", "7", "30"];
export const isHofPeriod = (v: unknown): v is HofPeriod => typeof v === "string" && Object.hasOwn(HOF_PERIODS, v);

// Erster Tag des Zeitraums (YYYY-MM-DD) bzw. null für „Gesamt“
export function periodStart(period: HofPeriod, today = todayVienna()) {
  if (period === "all") return null;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (Number(period) - 1));
  return d.toISOString().slice(0, 10);
}

export type HofPublication = {
  platform: PublicationPlatform;
  url: string;
  views: number | null;
  viewsAt: Date | null;
  lastError: string | null;
};

export type HofVideo = {
  id: string;
  title: string;
  status: string;
  publishDate: string | null;
  cutters: { id: string; name: string }[];
  publications: HofPublication[];
  views: number; // Summe der bekannten Plattform-Views
  platformViews: Record<PublicationPlatform, number>;
  counted: boolean; // mindestens ein Views-Stand vorhanden
};

export type HofRow = {
  rank: number;
  cutter: { id: string; name: string };
  videos: number;
  totalViews: number;
  avgViews: number;
  // Aufteilung der Gesamtviews nach Plattform
  platformViews: Record<PublicationPlatform, number>;
};

const zero = (): Record<PublicationPlatform, number> => ({ youtube: 0, tiktok: 0, instagram: 0 });

export async function hallOfFame(customerId: string, discipline: Discipline, period: HofPeriod = "all") {
  const formats = [...DISCIPLINES[discipline].formats] as string[];
  const today = todayVienna();
  const since = periodStart(period, today);
  const jobRows = await db
    .select({ id: jobs.id, title: jobs.title, status: jobs.status, publishDate: jobs.publishDate })
    .from(jobs)
    .where(
      and(
        eq(jobs.customerId, customerId),
        inArray(jobs.format, formats),
        ne(jobs.status, "storniert"),
        since ? gte(jobs.publishDate, since) : undefined,
        since ? lte(jobs.publishDate, today) : undefined,
      ),
    );
  const ids = jobRows.map((j) => j.id);

  const [pubs, cutters] = ids.length
    ? await Promise.all([
        db.select().from(publications).where(inArray(publications.jobId, ids)),
        db
          .select({ jobId: jobCutters.jobId, id: user.id, name: user.name })
          .from(jobCutters)
          .innerJoin(user, eq(user.id, jobCutters.userId))
          .where(inArray(jobCutters.jobId, ids)),
      ])
    : [[], []];

  // Nur Videos, die online sind oder schon einen Link haben, sind für die Hall of Fame relevant
  const videos: HofVideo[] = jobRows
    .map((j) => {
      const own = pubs.filter((p) => p.jobId === j.id);
      const known = own.filter((p) => p.views !== null);
      return {
        id: j.id,
        title: j.title,
        status: j.status,
        publishDate: j.publishDate,
        cutters: cutters.filter((c) => c.jobId === j.id).map((c) => ({ id: c.id, name: c.name })),
        publications: own.map((p) => ({
          platform: p.platform as PublicationPlatform,
          url: p.url,
          views: p.views,
          viewsAt: p.viewsAt,
          lastError: p.lastError,
        })),
        views: known.reduce((sum, p) => sum + (p.views ?? 0), 0),
        platformViews: Object.fromEntries(
          PUBLICATION_PLATFORMS.map((pl) => [
            pl,
            known.filter((p) => p.platform === pl).reduce((s, p) => s + (p.views ?? 0), 0),
          ]),
        ) as Record<PublicationPlatform, number>,
        counted: known.length > 0,
      };
    })
    .filter((v) => v.status === "online" || v.publications.length > 0)
    .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title));

  const byCutter = new Map<
    string,
    {
      cutter: { id: string; name: string };
      videos: number;
      totalViews: number;
      platformViews: Record<PublicationPlatform, number>;
    }
  >();
  for (const v of videos.filter((v) => v.counted)) {
    for (const c of v.cutters) {
      const row = byCutter.get(c.id) ?? { cutter: c, videos: 0, totalViews: 0, platformViews: zero() };
      row.videos++;
      row.totalViews += v.views;
      for (const pl of PUBLICATION_PLATFORMS) row.platformViews[pl] += v.platformViews[pl];
      byCutter.set(c.id, row);
    }
  }
  const ranking: HofRow[] = [...byCutter.values()]
    .map((r) => ({ ...r, avgViews: r.totalViews / r.videos }))
    .sort(
      (a, b) => b.avgViews - a.avgViews || b.totalViews - a.totalViews || a.cutter.name.localeCompare(b.cutter.name),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return { videos, ranking };
}
