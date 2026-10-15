import Link from "next/link";
import type { JobView } from "@/lib/queries";
import { BOARD_COLUMNS, STATUS_HINTS, STATUS_LABELS, statusColor } from "@/lib/status";
import { FormatTag, Person, formatDate } from "./ui";
import { LinkPending } from "./nav-links";
import { ColumnRow } from "./column-row";
import { boardColumnOrder } from "@/lib/board-prefs";

type Props = {
  jobs: JobView[];
  hrefFor: (jobId: string) => string;
  meId?: string;
  // Kunden sehen keine Cutter-Namen und keinen Client (sie sind es selbst)
  customerView?: boolean;
};

// Kanban-Spalten wie in Notion, jede Spalte in ihrer Status-Farbe.
// Die Reihenfolge der Spalten kann jeder Nutzer per Drag & Drop ändern.
export async function Kanban({ jobs, hrefFor, meId, customerView = false }: Props) {
  const order = await boardColumnOrder();
  const columns = BOARD_COLUMNS.map((status) => {
    const items = jobs.filter((j) => j.status === status);
    const color = statusColor(status);
    return {
      id: status as string,
      style: { background: `color-mix(in oklab, ${color} 7%, var(--surface))` },
      header: (
        <h3 className="flex items-center gap-2 px-1 py-1 text-sm" title={STATUS_HINTS[status]}>
          <span
            className="whitespace-nowrap rounded-md px-2 py-0.5 font-medium"
            style={{ background: `color-mix(in oklab, ${color} 22%, transparent)`, color }}
          >
            {STATUS_LABELS[status]}
          </span>
          <span className="text-muted">{items.length}</span>
        </h3>
      ),
      body: (
        <>
          {items.map((job) => {
            const mine = !!meId && job.cutters.some((c) => c.id === meId);
            return (
              <Link
                key={job.id}
                href={hrefFor(job.id)}
                scroll={false}
                className="block space-y-2.5 rounded-lg border p-3 text-sm shadow-sm transition-transform hover:-translate-y-px"
                style={{
                  background: `color-mix(in oklab, ${color} 5%, var(--card))`,
                  borderColor: mine ? "var(--accent)" : `color-mix(in oklab, ${color} 20%, var(--line))`,
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-snug">{job.title}</p>
                  <LinkPending className="mt-1.5" />
                </div>
                <div className="space-y-1.5 text-xs text-muted">
                  {!customerView && <Person name={job.customerName} />}
                  {!customerView && job.cutters.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {job.cutters.map((c) => (
                        <Person key={c.id} name={c.name} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <FormatTag format={job.format} />
                  {job.publishDate && <span className="text-xs text-muted">{formatDate(job.publishDate)}</span>}
                </div>
              </Link>
            );
          })}
          {items.length === 0 && <p className="px-1.5 pb-1 text-xs text-muted/70">Nichts hier</p>}
        </>
      ),
    };
  });

  // key: nach dem Speichern liefert der Server die neue Reihenfolge → Reihe neu aufbauen
  return <ColumnRow key={order.join()} order={order} columns={columns} />;
}
