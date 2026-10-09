import Link from "next/link";
import type { JobView } from "@/lib/queries";
import { statusColor } from "@/lib/status";
import { FormatTag, StatusBadge } from "./ui";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "2026-10" → Monatsanfang; ungültig → aktueller Monat
export function parseMonth(value: string | undefined) {
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Props = {
  month: Date;
  jobs: JobView[];
  hrefFor: (jobId: string) => string;
  monthHref: (key: string) => string;
  showClient: boolean;
};

// Monatskalender nach Veröffentlichungsdatum (wie die Kalenderansicht in Notion)
export function Calendar({ month, jobs, hrefFor, monthHref, showClient }: Props) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // Woche beginnt am Montag
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  // Letzte Zeile weglassen, wenn sie komplett im nächsten Monat liegt
  const visible = days[35].getMonth() !== month.getMonth() ? days.slice(0, 35) : days;
  const today = iso(new Date());

  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const title = month.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <div className="flex items-center gap-1 text-sm">
          <Link href={monthHref(monthKey(prev))} scroll={false} className="rounded-md px-2.5 py-1 text-muted hover:bg-raised hover:text-text" aria-label="Vorheriger Monat">
            ‹
          </Link>
          <Link href={monthHref(monthKey(new Date()))} scroll={false} className="rounded-md px-2.5 py-1 text-muted hover:bg-raised hover:text-text">
            Heute
          </Link>
          <Link href={monthHref(monthKey(next))} scroll={false} className="rounded-md px-2.5 py-1 text-muted hover:bg-raised hover:text-text" aria-label="Nächster Monat">
            ›
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[840px] grid-cols-7 overflow-hidden rounded-xl border border-line bg-line gap-px">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-surface px-2 py-1.5 text-center text-xs text-muted">
              {d}
            </div>
          ))}
          {visible.map((d) => {
            const key = iso(d);
            const inMonth = d.getMonth() === month.getMonth();
            const items = jobs.filter((j) => j.publishDate === key);
            return (
              <div key={key} className={`min-h-28 space-y-1.5 p-1.5 ${inMonth ? "bg-surface" : "bg-canvas"}`}>
                <div className="flex justify-end">
                  <span
                    className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${
                      key === today ? "bg-rec font-semibold text-white" : inMonth ? "text-text" : "text-muted/60"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                </div>
                {items.map((job) => {
                  const color = statusColor(job.status);
                  return (
                    <Link
                      key={job.id}
                      href={hrefFor(job.id)}
                      scroll={false}
                      className="block space-y-1 rounded-md border-l-2 p-1.5 text-xs transition-colors"
                      style={{ background: `color-mix(in oklab, ${color} 12%, var(--raised))`, borderColor: color }}
                    >
                      <p className="truncate font-medium">{job.title}</p>
                      {showClient && <p className="truncate text-muted">{job.customerName}</p>}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <FormatTag format={job.format} />
                        <StatusBadge status={job.status} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
