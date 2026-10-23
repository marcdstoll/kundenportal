import Link from "next/link";
import type { JobView } from "@/lib/queries";
import type { FilterView } from "@/lib/view-filters";
import { BilledToggle } from "./billed-toggle";
import { FilterButton } from "./filter-button";
import { Avatar, ExternalLink, FormatTag, Person, StatusBadge, formatDate, shortLink } from "./ui";

import { STATUSES } from "@/lib/status";

// Sortierbare Spalten (pro Nutzer und Ansicht gespeichert: s=title, d=asc)
export const SORT_KEYS = [
  "title",
  "status",
  "format",
  "client",
  "cutter",
  "publish",
  "billedCustomer",
  "billed",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type Sort = { key: SortKey; dir: "asc" | "desc" } | null;

export function parseSort(s: string | string[] | undefined, d: string | string[] | undefined): Sort {
  const key = SORT_KEYS.find((k) => k === s);
  return key ? { key, dir: d === "desc" ? "desc" : "asc" } : null;
}

const STATUS_RANK = Object.fromEntries([...STATUSES].map((st, i) => [st, i]));

function sortValue(job: JobView, key: SortKey): string | number {
  switch (key) {
    case "title":
      return job.title.toLowerCase();
    case "status":
      return STATUS_RANK[job.status] ?? 99;
    case "format":
      return job.format;
    case "client":
      return job.customerName.toLowerCase();
    case "cutter":
      return job.cutters[0]?.name.toLowerCase() ?? "\uffff"; // ohne Cutter ans Ende
    case "publish":
      return job.publishDate ?? "9999";
    case "billedCustomer":
      return job.billedCustomer ? 1 : 0;
    case "billed":
      return job.billed ? 1 : 0;
  }
}

export function sortJobs(jobs: JobView[], sort: Sort) {
  if (!sort) return jobs;
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...jobs].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    return (va < vb ? -1 : va > vb ? 1 : 0) * factor;
  });
}

type Props = {
  jobs: JobView[];
  hrefFor: (jobId: string) => string;
  isAdmin: boolean;
  sort: Sort;
  // Ansicht, in der die Sortierung gespeichert wird (Klick auf eine Spaltenüberschrift)
  view: FilterView;
  // Logo-URLs (Nutzer-ID → URL), damit statt Initialen das aktuelle Logo erscheint
  logos?: Map<string, string>;
};

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Name" },
  { key: "status", label: "Status" },
  { key: "format", label: "Format" },
  { key: "client", label: "Client" },
  { key: "cutter", label: "Cutter" },
  { key: "publish", label: "Veröffentlichung" },
  { key: "billedCustomer", label: "Kunde abger." },
  { key: "billed", label: "Cutter abger." },
];

// Tabelle wie "Projekte nach Cutter/Clients sortiert" in Notion – Klick auf Überschrift sortiert
export function JobTable({ jobs, hrefFor, isAdmin, sort, view, logos }: Props) {
  if (jobs.length === 0) {
    return <p className="px-1 py-6 text-sm text-muted">Hier gibt es noch keine Projekte.</p>;
  }
  const sorted = sortJobs(jobs, sort);
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[1180px] text-left text-sm">
        <thead className="bg-surface text-xs text-muted">
          <tr>
            {COLUMNS.map((c) => {
              const active = sort?.key === c.key;
              const nextDir = active && sort?.dir === "asc" ? "desc" : "asc";
              return (
                <th
                  key={c.key}
                  className="px-4 py-2.5 font-medium"
                  aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  <FilterButton
                    view={view}
                    patch={{ s: c.key, d: nextDir }}
                    className={`inline-flex items-center gap-1 whitespace-nowrap font-medium hover:text-text ${active ? "text-text" : ""}`}
                  >
                    {c.label}
                    <span aria-hidden className={active ? "" : "opacity-0"}>
                      {active && sort?.dir === "desc" ? "↓" : "↑"}
                    </span>
                  </FilterButton>
                </th>
              );
            })}
            <th className="px-4 py-2.5 font-medium">Review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((job) => (
            <tr key={job.id} className="transition-colors hover:bg-surface/60">
              <td className="min-w-52 px-4 py-2.5">
                <Link href={hrefFor(job.id)} scroll={false} className="font-medium hover:underline">
                  {job.title}
                </Link>
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={job.status} />
              </td>
              <td className="px-4 py-2.5">
                <FormatTag format={job.format} />
              </td>
              <td className="px-4 py-2.5">
                <Person name={job.customerName} id={job.customerId} logoUrl={logos?.get(job.customerId)} />
              </td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {job.cutters.map((c) => (
                    <Person key={c.id} name={c.name} id={c.id} logoUrl={logos?.get(c.id)} />
                  ))}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDate(job.publishDate)}</td>
              <td className="px-4 py-2.5">
                <BilledToggle
                  key={`k-${job.billedCustomer}`}
                  jobId={job.id}
                  billed={job.billedCustomer}
                  editable={isAdmin}
                  which="kunde"
                />
              </td>
              <td className="px-4 py-2.5">
                <BilledToggle
                  key={`c-${job.billed}`}
                  jobId={job.id}
                  billed={job.billed}
                  editable={isAdmin}
                  which="cutter"
                />
              </td>
              <td className="max-w-40 px-4 py-2.5">
                {job.reviewUrl && <ExternalLink href={job.reviewUrl}>{shortLink(job.reviewUrl)}</ExternalLink>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Reiter mit Personen (wie die Tabs in Notion)
export function PersonTabs({
  people,
  activeId,
  view,
  logos,
}: {
  people: { id: string; name: string }[];
  activeId: string | null;
  // Ansicht, in der die gewählte Person gespeichert wird
  view: FilterView;
  logos?: Map<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((p) => (
        <FilterButton
          key={p.id}
          view={view}
          patch={{ c: p.id }}
          aria-current={p.id === activeId ? "true" : undefined}
          className={`inline-flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3 text-sm transition-colors ${
            p.id === activeId ? "bg-raised text-text" : "text-muted hover:bg-surface hover:text-text"
          }`}
        >
          <Avatar name={p.name} id={p.id} logoUrl={logos?.get(p.id)} />
          {p.name}
        </FilterButton>
      ))}
    </div>
  );
}
