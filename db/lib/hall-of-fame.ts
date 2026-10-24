import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { jobCutters, jobs, publications, user } from "@/db/schema";
import { DISCIPLINES, type Discipline, type PublicationPlatform } from "@/lib/publications";

// Hall of Fame je Client und Disziplin (siehe Briefing 04, Punkt 2):
//   Gesamtviews je Cutter = Summe der Views seiner Videos (Video = Summe aller Plattform-Views)
//   Ø Views pro Video     = Gesamtviews / Anzahl berücksichtigter Videos
// Berücksichtigt wird ein Video, sobald mindestens eine Veröffentlichung einen Views-Stand hat.
// Mehrere Cutter an einem Video: jeder bekommt das Video voll angerechnet (Regel noch offen).

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
  counted: boolean; // mindestens ein Views-Stand vorhanden
};

export type HofRow = {
  rank: number;
  cutter: { id: string; name: string };
  videos: number;
  totalViews: number;
  avgViews: number;
};

export async function hallOfFame(customerId: string, discipline: Discipline) {
  const formats = [...DISCIPLINES[discipline].formats] as string[];
  const jobRows = await db
    .select({ id: jobs.id, title: jobs.title, status: jobs.status, publishDate: jobs.publishDate })
    .from(jobs)
    .where(and(eq(jobs.customerId, customerId), inArray(jobs.format, formats), ne(jobs.status, "storniert")));
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
        counted: known.length > 0,
      };
    })
    .filter((v) => v.status === "online" || v.publications.length > 0)
    .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title));

  const byCutter = new Map<string, { cutter: { id: string; name: string }; videos: number; totalViews: number }>();
  for (const v of videos.filter((v) => v.counted)) {
    for (const c of v.cutters) {
      const row = byCutter.get(c.id) ?? { cutter: c, videos: 0, totalViews: 0 };
      row.videos++;
      row.totalViews += v.views;
      byCutter.set(c.id, row);
    }
  }
  const ranking: HofRow[] = [...byCutter.values()]
    .map((r) => ({ ...r, avgViews: r.totalViews / r.videos }))
    .sort(
      (a, b) => b.avgViews - a.avgViews || b.totalViews - a.totalViews || a.cutter.name.localeCompare(b.cutter.name),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const stamps = pubs.map((p) => p.viewsAt?.getTime() ?? 0).filter(Boolean);
  return {
    videos,
    ranking,
    updatedAt: stamps.length ? new Date(Math.max(...stamps)) : null,
    withoutLink: videos.filter((v) => v.publications.length === 0).length,
    withoutCutter: videos.filter((v) => v.counted && v.cutters.length === 0).length,
  };
}
