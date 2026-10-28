import Link from "next/link";
import type { JobView } from "@/lib/queries";
import { Kanban } from "./kanban";
import { FormatTag, StatusBadge, formatDate } from "./ui";

// Projektübersicht eines Kunden: Board ohne Online-Spalte, darunter die veröffentlichten Projekte als Kacheln.
// Genutzt auf „Projekte“ (/kunde) und aufgeklappt in der Kunden-Übersicht.
export function CustomerProjects({
  jobs,
  unread,
  hrefFor,
}: {
  jobs: JobView[];
  unread: Map<string, number>;
  hrefFor: (id: string) => string;
}) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
        Noch keine Projekte. Lade dein erstes Material über „Projekt anlegen“ hoch.
      </div>
    );
  }
  const online = jobs.filter((j) => j.status === "online");
  return (
    <>
      <Kanban jobs={jobs} unread={unread} customerView hrefFor={hrefFor} />
      {online.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <StatusBadge status="online" />
            <span className="text-muted">{online.length}</span>
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {online.map((job) => (
              <Link
                key={job.id}
                href={hrefFor(job.id)}
                scroll={false}
                className="space-y-1.5 rounded-lg border border-line bg-card p-3 text-sm transition-transform hover:-translate-y-px"
                style={{ borderLeft: "3px solid var(--st-online)" }}
              >
                <p className="font-medium">{job.title}</p>
                <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                  <FormatTag format={job.format} />
                  {job.publishDate && <span>{formatDate(job.publishDate)}</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
