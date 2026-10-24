import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { clientLogos, listCustomers, loadViewFilters } from "@/lib/queries";
import { clientIdsOfCutter } from "@/lib/access";
import { hallOfFameForCutters } from "@/lib/settings";
import { hallOfFame, type HofPublication, type HofVideo } from "@/lib/hall-of-fame";
import {
  DISCIPLINES,
  PLATFORM_LABELS,
  PUBLICATION_PLATFORMS,
  formatViews,
  isDiscipline,
  type Discipline,
} from "@/lib/publications";
import { PageHeader } from "@/app/components/shell";
import { PersonTabs } from "@/app/components/job-table";
import { FilterButton } from "@/app/components/filter-button";
import { JobDrawer } from "@/app/components/job-drawer";
import { Avatar, formatDateTime } from "@/app/components/ui";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function HallOfFamePage({ searchParams }: { searchParams: Params }) {
  return <Content searchParams={searchParams} />;
}

// Hall of Fame: Cutter je Client vergleichen, getrennt nach Disziplin.
// Sichtbar für Admins; für Cutter erst, wenn in den Einstellungen freigegeben (dann nur ihre Clients).
async function Content({ searchParams }: { searchParams: Params }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const isAdmin = me.role === "admin";
  if (!isAdmin && !(me.role === "cutter" && (await hallOfFameForCutters()))) redirect("/dashboard");

  const params = await searchParams;
  const openJob = typeof params.job === "string" ? params.job : null;
  const all = await listCustomers();
  const allowed = isAdmin ? null : await clientIdsOfCutter(me.id);
  const clients = (allowed ? all.filter((c) => allowed.includes(c.id)) : all).map((c) => ({ id: c.id, name: c.name }));

  // Gewählter Client und Disziplin sind pro Nutzer gespeichert
  const saved = await loadViewFilters(me.id, "hall-of-fame");
  const client = clients.find((c) => c.id === saved.c) ?? clients[0] ?? null;
  const discipline: Discipline = isDiscipline(saved.d) ? saved.d : "short";
  const [data, logos] = await Promise.all([client ? hallOfFame(client.id, discipline) : null, clientLogos()]);

  return (
    <>
      <PageHeader title="Hall of Fame">
        <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Disziplin">
          {(Object.keys(DISCIPLINES) as Discipline[]).map((d) => (
            <FilterButton
              key={d}
              view="hall-of-fame"
              patch={{ d }}
              aria-pressed={d === discipline}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                d === discipline ? "bg-raised font-medium text-text" : "text-muted hover:text-text"
              }`}
            >
              {DISCIPLINES[d].label}
            </FilterButton>
          ))}
        </div>
      </PageHeader>

      <div className="space-y-6 px-4 pb-10 sm:px-6 md:px-10">
        {clients.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Clients.</p>
        ) : (
          <PersonTabs logos={logos} people={clients} activeId={client?.id ?? null} view="hall-of-fame" />
        )}

        {client && data && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {client.name} <span className="font-normal text-muted">· {DISCIPLINES[discipline].label}</span>
              </h2>
            </div>

            <Ranking rows={data.ranking} logos={logos} />

            {(data.withoutLink > 0 || data.withoutCutter > 0) && isAdmin && (
              <p className="text-sm text-muted">
                {data.withoutLink > 0 &&
                  `${data.withoutLink} ${data.withoutLink === 1 ? "Video" : "Videos"} ohne Link – trag die Links im Projekt unter „Veröffentlichungen“ ein. `}
                {data.withoutCutter > 0 &&
                  `${data.withoutCutter} ${data.withoutCutter === 1 ? "Video hat" : "Videos haben"} keinen Cutter und ${data.withoutCutter === 1 ? "zählt" : "zählen"} nicht.`}
              </p>
            )}

            <VideoList videos={data.videos} canOpen={isAdmin} />

          </>
        )}
      </div>
      {openJob && isAdmin && <JobDrawer jobId={openJob} closeHref="/hall-of-fame" me={me} />}
    </>
  );
}

const MEDALS = ["#d4a017", "#9ca3af", "#b87333"];

function Ranking({
  rows,
  logos,
}: {
  rows: Awaited<ReturnType<typeof hallOfFame>>["ranking"];
  logos: Map<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        Noch keine Videos mit Views für diese Auswahl.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[560px] text-left text-sm" aria-label="Rangliste">
        <thead className="bg-surface text-xs text-muted">
          <tr>
            <th className="w-16 px-4 py-2.5 font-medium">Rang</th>
            <th className="px-4 py-2.5 font-medium">Cutter</th>
            <th className="px-4 py-2.5 text-right font-medium">Videos</th>
            <th className="px-4 py-2.5 text-right font-medium">Gesamtviews</th>
            <th className="px-4 py-2.5 text-right font-medium">Ø Views pro Video</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.cutter.id}>
              <td className="px-4 py-3">
                <span
                  className="inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                  style={
                    r.rank <= 3
                      ? { background: MEDALS[r.rank - 1], color: "white" }
                      : { background: "var(--raised)", color: "var(--muted)" }
                  }
                >
                  {r.rank}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  <Avatar name={r.cutter.name} id={r.cutter.id} logoUrl={logos.get(r.cutter.id)} />
                  <span className="font-medium">{r.cutter.name}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{r.videos}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatViews(r.totalViews)}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatViews(r.avgViews)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Alle relevanten Videos mit ihren Plattform-Views – zum Prüfen der Zuordnung
function VideoList({ videos, canOpen }: { videos: HofVideo[]; canOpen: boolean }) {
  if (videos.length === 0) return null;
  return (
    <details className="group rounded-xl border border-line" open={videos.length <= 12}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        Videos ({videos.filter((v) => v.counted).length} von {videos.length} mit Views)
      </summary>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[760px] text-left text-sm" aria-label="Videos">
          <thead className="bg-surface text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Video</th>
              <th className="px-4 py-2.5 font-medium">Cutter</th>
              {PUBLICATION_PLATFORMS.map((p) => (
                <th key={p} className="px-4 py-2.5 text-right font-medium">
                  {PLATFORM_LABELS[p]}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right font-medium">Views</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {videos.map((v) => (
              <tr key={v.id} data-testid="hof-video">
                <td className="px-4 py-2.5">
                  {canOpen ? (
                    <Link href={`/hall-of-fame?job=${v.id}`} scroll={false} className="font-medium hover:underline">
                      {v.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{v.title}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted">{v.cutters.map((c) => c.name).join(", ") || "–"}</td>
                {PUBLICATION_PLATFORMS.map((p) => (
                  <td key={p} className="px-4 py-2.5 text-right tabular-nums">
                    <PlatformCell pub={v.publications.find((x) => x.platform === p)} />
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {v.counted ? formatViews(v.views) : <span className="text-muted">–</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function PlatformCell({ pub }: { pub?: HofPublication }) {
  if (!pub) return <span className="text-muted/60">–</span>;
  const problem = pub.lastError && (
    <span className="ml-1 cursor-help text-xs" title={pub.lastError} aria-label={pub.lastError}>
      ⚠
    </span>
  );
  if (pub.views === null) {
    return (
      <a
        href={pub.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-muted hover:underline"
        title={pub.lastError ?? undefined}
      >
        {pub.lastError?.startsWith("Abruf noch nicht angebunden") ? "Link ✓" : pub.lastError ? "Fehler" : "ausstehend"}
        {pub.lastError && !pub.lastError.startsWith("Abruf noch nicht angebunden") && problem}
      </a>
    );
  }
  return (
    <span>
      <a href={pub.url} target="_blank" rel="noreferrer" className="hover:underline">
        {formatViews(pub.views)}
      </a>
      {problem}
    </span>
  );
}
