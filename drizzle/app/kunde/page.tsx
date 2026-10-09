import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { jobs as jobsTable } from "@/db/schema";
import { getCurrentUser, resolveCustomerView } from "@/lib/session";
import { loadJobs } from "@/lib/queries";
import { PageHeader, ViewAsBanner } from "@/app/components/shell";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { Kanban } from "@/app/components/kanban";
import { CustomerJobDrawer } from "@/app/components/job-drawer";
import { FormatTag, StatusBadge, buttonPrimary, formatDate } from "@/app/components/ui";

export default function KundePage({ searchParams }: PageProps<"/kunde">) {
  return (
    <Content searchParams={searchParams} />
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/kunde">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const params = await searchParams;
  const asParam = typeof params.as === "string" ? params.as : undefined;
  const view = await resolveCustomerView(me, asParam);
  if (!view) redirect("/board");

  const { customer, viewAs } = view;
  const openJob = typeof params.job === "string" ? params.job : null;
  const base = viewAs ? `/kunde?as=${viewAs.id}` : "/kunde";
  const sep = viewAs ? "&" : "?";

  const jobs = await loadJobs(eq(jobsTable.customerId, customer.id));
  const online = jobs.filter((j) => j.status === "online");

  return (
    <>
      <ViewAsBanner viewAs={viewAs} />
      <AutoRefresh seconds={15} />
      <PageHeader title={viewAs ? `Projekte von ${customer.name}` : "Deine Projekte"}>
        <Link href={viewAs ? `/kalender?as=${viewAs.id}` : "/kalender"} className="rounded-md border border-line px-3 py-2 text-sm hover:bg-raised">
          Kalender
        </Link>
        {!viewAs && (
          <Link href="/neu" className={buttonPrimary}>
            Neues Projekt
          </Link>
        )}
      </PageHeader>

      <div className="space-y-4 px-6 pb-10 md:px-10">
        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
            Noch keine Projekte. Lade dein erstes Material über „Neues Projekt“ hoch.
          </div>
        ) : (
          <>
            <Kanban jobs={jobs} customerView hrefFor={(id) => `${base}${sep}job=${id}`} />
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
                      href={`${base}${sep}job=${job.id}`}
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
        )}
      </div>

      {openJob && <CustomerJobDrawer jobId={openJob} closeHref={base} customerId={customer.id} />}
    </>
  );
}
