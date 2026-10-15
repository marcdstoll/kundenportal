import Link from "next/link";
import type { JobView } from "@/lib/queries";
import { CalendarGrid, type CalendarDay, type CalendarItem } from "./calendar-grid";

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
  // Darf der aktuelle Nutzer diesen Termin per Drag & Drop verschieben?
  canMove: (job: JobView) => boolean;
  // z. B. der Kunden-Filter rechts neben der Monatsnavigation
  toolbar?: React.ReactNode;
};

// Monatskalender nach Veröffentlichungsdatum (wie die Kalenderansicht in Notion).
// Läuft auf dem Server; das Raster mit Drag & Drop ist eine Client-Komponente (calendar-grid.tsx).
// Funktionen wie hrefFor können nicht in den Browser geschickt werden – deshalb rechnen wir
// hier alle Links und Rechte vorab aus und geben nur einfache Daten weiter.
export function Calendar({ month, jobs, hrefFor, monthHref, showClient, canMove, toolbar }: Props) {
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

  const gridDays: CalendarDay[] = visible.map((d) => ({
    key: iso(d),
    day: d.getDate(),
    inMonth: d.getMonth() === month.getMonth(),
    isToday: iso(d) === today,
  }));
  const items: CalendarItem[] = jobs
    .filter((j) => j.publishDate)
    .map((j) => ({
      id: j.id,
      title: j.title,
      customerName: j.customerName,
      format: j.format,
      status: j.status,
      date: j.publishDate!,
      href: hrefFor(j.id),
      canMove: canMove(j),
    }));

  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const title = month.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {toolbar}
          <Link
            href={monthHref(monthKey(prev))}
            scroll={false}
            className="rounded-md px-2.5 py-1 text-muted hover:bg-raised hover:text-text"
            aria-label="Vorheriger Monat"
          >
            ‹
          </Link>
          <Link
            href={monthHref(monthKey(new Date()))}
            scroll={false}
            className="rounded-md px-2.5 py-1 text-muted hover:bg-raised hover:text-text"
          >
            Heute
          </Link>
          <Link
            href={monthHref(monthKey(next))}
            scroll={false}
            className="rounded-md px-2.5 py-1 text-muted hover:bg-raised hover:text-text"
            aria-label="Nächster Monat"
          >
            ›
          </Link>
        </div>
      </div>

      <CalendarGrid days={gridDays} items={items} showClient={showClient} />
    </div>
  );
}
