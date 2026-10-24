import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { clientLogos, listCustomers, loadViewFilters } from "@/lib/queries";
import { hallOfFame, type HofRow } from "@/lib/hall-of-fame";
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
import { Avatar } from "@/app/components/ui";

export default function HallOfFamePage() {
  return <Content />;
}

// Hall of Fame (nur Admins): Cutter je Client vergleichen, getrennt nach Disziplin
async function Content() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const clients = (await listCustomers()).map((c) => ({ id: c.id, name: c.name }));

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
            <h2 className="text-lg font-semibold">
              {client.name} <span className="font-normal text-muted">· {DISCIPLINES[discipline].label}</span>
            </h2>
            <Ranking rows={data.ranking} logos={logos} />
          </>
        )}
      </div>
    </>
  );
}

const MEDALS = ["#d4a017", "#9ca3af", "#b87333"];

// Rangliste: nach Ø Views pro Video absteigend; Gesamtviews mit Aufteilung nach Plattform
function Ranking({ rows, logos }: { rows: HofRow[]; logos: Map<string, string> }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        Noch keine Videos mit Views für diese Auswahl.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[820px] text-left text-sm" aria-label="Rangliste">
        <thead className="bg-surface text-xs text-muted">
          <tr>
            <th className="w-16 px-4 py-2.5 font-medium">Rang</th>
            <th className="px-4 py-2.5 font-medium">Cutter</th>
            <th className="px-4 py-2.5 text-right font-medium">Videos</th>
            {PUBLICATION_PLATFORMS.map((p) => (
              <th key={p} className="px-4 py-2.5 text-right font-medium">
                {PLATFORM_LABELS[p]}
              </th>
            ))}
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
              {PUBLICATION_PLATFORMS.map((p) => (
                <td key={p} className="px-4 py-3 text-right tabular-nums text-muted">
                  {formatViews(r.platformViews[p])}
                </td>
              ))}
              <td className="px-4 py-3 text-right tabular-nums">{formatViews(r.totalViews)}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatViews(r.avgViews)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
