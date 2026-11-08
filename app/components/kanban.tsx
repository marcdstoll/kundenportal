import Link from "next/link";
import { personColor } from "@/lib/colors";
import type { JobView } from "@/lib/queries";
import { BOARD_COLUMNS, STATUS_HINTS, STATUS_LABELS, statusColor } from "@/lib/status";
import { FormatTag, Person, formatDate } from "./ui";
import { LinkPending } from "./nav-links";
import { ColumnRow } from "./column-row";
import { boardColumnOrder } from "@/lib/board-prefs";
import { jobDeadlineWarning, todayVienna } from "@/lib/deadline";
import { DeadlineBadge } from "./deadline-badge";
import {getCurrentUser} from "@/lib/session";
import { JobContextMenu } from "./job-context-menu";

type Props = {
  jobs: JobView[];
  hrefFor: (jobId: string) => string;
  meId?: string;
  // Kunden sehen keine Cutter-Namen und keinen Client (sie sind es selbst)
  customerView?: boolean;
  // Anzahl ungelesener Inbox-Einträge je Projekt (für die "Neu"-Markierung)
  unread?: Map<string, number>;
  // Logo-URLs der Kunden (Kunden-ID → URL)
  logos?: Map<string, string>;
};

// Kalendertag (YYYY-MM-DD) nach Wiener Zeit
const dayVienna = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// Kanban-Spalten wie in Notion, jede Spalte in ihrer Status-Farbe.
// Die Reihenfolge der Spalten kann jeder Nutzer per Drag & Drop ändern.
export async function Kanban({ jobs, hrefFor, meId, customerView = false, unread, logos }: Props) {
  const me = await getCurrentUser();
  const canReorder = me?.role === "admin";
  const order = canReorder ? await boardColumnOrder() : [...BOARD_COLUMNS];
  const today = todayVienna();
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
            style={{
              background: `color-mix(in oklab, ${color} 22%, transparent)`,
              color,
            }}
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
            // Grundfarbe der Karte = Farbe des Kunden (unabhängig vom Status)
            const base = personColor(job.customerId, job.customerName);
            return (
              <Link
                key={job.id}
                href={hrefFor(job.id)}
                scroll={false}
                data-job-id={job.id}
                className="block space-y-2.5 rounded-lg border p-3 text-sm shadow-sm transition-transform hover:-translate-y-px"
                style={{
                  background: `color-mix(in oklab, ${base} 6%, var(--card))`,
                  borderColor: mine ? "var(--accent)" : `color-mix(in oklab, ${base} 25%, var(--line))`,
                  borderLeft: `3px solid ${base}`,
                }}
              >
                <DeadlineBadge label={jobDeadlineWarning(job.publishDate, job.status, today)} date={job.publishDate} />
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-snug">{job.title}</p>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <LinkPending />
                    {!!unread?.get(job.id) && (
                      <span
                        className="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white"
                        style={{ background: "var(--rec)" }}
                        title={`${unread.get(job.id)} neue Einträge in der Inbox`}
                      >
                        Neu
                      </span>
                    )}
                  </span>
                </div>
                {job.cancelRequestedAt && (
                  <p className="rounded bg-danger/10 px-1.5 py-0.5 text-xs font-medium text-danger">
                    ⏸ Storno angefragt – pausiert
                  </p>
                )}
                <div className="space-y-1.5 text-xs text-muted">
                  {!customerView && <Person name={job.customerName} id={job.customerId} logoUrl={logos?.get(job.customerId)} />}
                  {!customerView && job.cutters.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {job.cutters.map((c) => (
                        <Person key={c.id} name={c.name} id={c.id} logoUrl={logos?.get(c.id)} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <FormatTag format={job.format} />
                  {job.publishDate && <span className="text-xs text-muted">{formatDate(job.publishDate)}</span>}
                </div>
                {!customerView && (
                  <p className="border-t border-line/60 pt-1.5 text-[11px] text-muted" data-testid="card-created">
                    Erstellt {formatDate(dayVienna(job.createdAt))}
                    {job.creatorName && ` · ${job.creatorName}`}
                  </p>
                )}
              </Link>
            );
          })}
          {items.length === 0 && <p className="px-1.5 pb-1 text-xs text-muted/70">Nichts hier</p>}
        </>
      ),
    };
  });

  // key: nach dem Speichern liefert der Server die neue Reihenfolge → Reihe neu aufbauen
  const row = <ColumnRow key={order.join()} order={order} columns={columns} canReorder={canReorder} />;
  // Rechtsklick-Menü (Schnellzugriff) für Admins und Cutter – nicht in der Kundenansicht
  if (customerView || !me || me.role === "kunde") return row;
  return (
    <JobContextMenu
      isAdmin={me.role === "admin"}
      jobs={jobs.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        paused: !!j.cancelRequestedAt,
        assigned: j.cutters.some((c) => c.id === me.id),
        noClient: !j.customerHasUsers,
      }))}
    >
      {row}
    </JobContextMenu>
  );
}
