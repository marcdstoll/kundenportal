import Link from "next/link";
import type { JobView } from "@/lib/queries";
import { BilledToggle } from "./billed-toggle";
import { ExternalLink, FormatTag, Person, StatusBadge, formatDate, shortLink } from "./ui";

type Props = {
  jobs: JobView[];
  hrefFor: (jobId: string) => string;
  isAdmin: boolean;
};

// Tabelle wie "Projekte nach Cutter/Clients sortiert" in Notion
export function JobTable({ jobs, hrefFor, isAdmin }: Props) {
  if (jobs.length === 0) {
    return <p className="px-1 py-6 text-sm text-muted">Hier gibt es noch keine Projekte.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead className="bg-surface text-xs text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Format</th>
            <th className="px-4 py-2.5 font-medium">Client</th>
            <th className="px-4 py-2.5 font-medium">Cutter</th>
            <th className="px-4 py-2.5 font-medium">Veröffentlichung</th>
            <th className="px-4 py-2.5 font-medium">Abgerechnet</th>
            <th className="px-4 py-2.5 font-medium">Review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {jobs.map((job) => (
            <tr key={job.id} className="transition-colors hover:bg-surface/60">
              <td className="px-4 py-2.5">
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
                <Person name={job.customerName} />
              </td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {job.cutters.map((c) => (
                    <Person key={c.id} name={c.name} />
                  ))}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDate(job.publishDate)}</td>
              <td className="px-4 py-2.5">
                <BilledToggle jobId={job.id} billed={job.billed} editable={isAdmin} />
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
  hrefFor,
}: {
  people: { id: string; name: string }[];
  activeId: string | null;
  hrefFor: (id: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((p) => (
        <Link
          key={p.id}
          href={hrefFor(p.id)}
          scroll={false}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${
            p.id === activeId ? "bg-raised text-text" : "text-muted hover:bg-surface hover:text-text"
          }`}
        >
          {p.name}
        </Link>
      ))}
    </div>
  );
}
