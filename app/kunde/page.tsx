import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { jobs as jobsTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { loadJobs } from "@/lib/queries";
import { CUSTOMER_STATUS_LABELS } from "@/lib/status";
import { Shell, PageHeader } from "@/app/components/shell";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { ExternalLink, FormatTag, StatusBadge } from "@/app/components/ui";

export default function KundePage() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Lade…</p>}>
      <Content />
    </Suspense>
  );
}

// Ab diesen Status sieht der Client den Review-Link
const VISIBLE_REVIEW = ["complete", "ready_to_post", "online"];

async function Content() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "kunde") redirect("/board");

  const myJobs = await loadJobs(eq(jobsTable.customerId, me.id));

  return (
    <Shell user={me}>
      <AutoRefresh seconds={15} />
      <PageHeader title="Meine Projekte">
        <Link
          href="/neu"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
        >
          Neues Projekt
        </Link>
      </PageHeader>

      <div className="max-w-3xl space-y-2 px-6 pb-10 md:px-10">
        {myJobs.length === 0 && (
          <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
            Noch keine Projekte. Lade dein erstes Material über „Neues Projekt“ hoch.
          </div>
        )}

        {myJobs.map((job) => (
          <article key={job.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium">{job.title}</p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <FormatTag format={job.format} />
                <span>{job.platform}</span>
                <span>{job.createdAt.toLocaleDateString("de-DE")}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {VISIBLE_REVIEW.includes(job.status) && job.reviewUrl && (
                <ExternalLink href={job.reviewUrl}>Video ansehen</ExternalLink>
              )}
              <StatusBadge status={job.status} label={CUSTOMER_STATUS_LABELS[job.status]} />
            </div>
          </article>
        ))}
      </div>
    </Shell>
  );
}
