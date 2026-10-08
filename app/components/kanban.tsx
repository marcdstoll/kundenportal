import Link from "next/link";
import type { JobView } from "@/lib/queries";
import { BOARD_COLUMNS, STATUS_HINTS, STATUS_LABELS, STATUS_STYLES } from "@/lib/status";
import { FormatTag, Person } from "./ui";

type Props = {
  jobs: JobView[];
  hrefFor: (jobId: string) => string;
  meId: string;
};

// Kanban-Spalten: To Dos bis Ready to post
export function Kanban({ jobs, hrefFor, meId }: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {BOARD_COLUMNS.map((status) => {
        const items = jobs.filter((j) => j.status === status);
        const style = STATUS_STYLES[status];
        return (
          <section key={status} className="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-surface/60 p-2">
            <h3 className="flex items-center gap-2 px-1.5 py-1 text-sm" title={STATUS_HINTS[status]}>
              <span className={`size-2 rounded-full ${style.dot}`} />
              <span className="font-medium">{STATUS_LABELS[status]}</span>
              <span className="text-muted">{items.length}</span>
            </h3>
            {items.map((job) => {
              const mine = job.cutters.some((c) => c.id === meId);
              return (
                <Link
                  key={job.id}
                  href={hrefFor(job.id)}
                  scroll={false}
                  className={`block space-y-2.5 rounded-lg border bg-raised/70 p-3 text-sm transition-colors hover:border-muted/40 hover:bg-raised ${
                    mine ? "border-accent/50" : "border-line"
                  }`}
                >
                  <p className="font-medium leading-snug">{job.title}</p>
                  <div className="space-y-1.5 text-xs text-muted">
                    <Person name={job.customerName} />
                    {job.cutters.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {job.cutters.map((c) => (
                          <Person key={c.id} name={c.name} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <FormatTag format={job.format} />
                    {job.feedbackNote && job.status === "warteschlange" && (
                      <span className="text-xs text-violet-300">Feedback offen</span>
                    )}
                  </div>
                </Link>
              );
            })}
            {items.length === 0 && <p className="px-1.5 pb-1 text-xs text-muted/70">Leer</p>}
          </section>
        );
      })}
    </div>
  );
}
