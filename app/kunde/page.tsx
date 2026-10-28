import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { jobs as jobsTable } from "@/db/schema";
import { getCurrentUser, resolveCustomerView } from "@/lib/session";
import { loadJobs, unreadByJob } from "@/lib/queries";
import { PageHeader, ViewAsBanner } from "@/app/components/shell";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { CustomerProjects } from "@/app/components/customer-projects";
import { CustomerJobDrawer } from "@/app/components/job-drawer";
import { buttonPrimary } from "@/app/components/ui";

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
  if (!view) {
    if (me.role !== "kunde") redirect("/board");
    return (
      <p className="m-10 rounded-xl border border-dashed border-line p-6 text-sm text-muted">
        Dein Zugang ist noch keinem Kunden zugeordnet. Bitte melde dich bei uns.
      </p>
    );
  }

  const { customer, viewAs } = view;
  const openJob = typeof params.job === "string" ? params.job : null;
  const base = viewAs ? `/kunde?as=${viewAs.id}` : "/kunde";
  const sep = viewAs ? "&" : "?";

  const [jobs, unread] = await Promise.all([loadJobs(eq(jobsTable.customerId, customer.id)), unreadByJob(me.id)]);

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
            Projekt anlegen
          </Link>
        )}
      </PageHeader>

      <div className="space-y-4 px-4 pb-10 sm:px-6 md:px-10">
        <CustomerProjects jobs={jobs} unread={unread.jobs} hrefFor={(id) => `${base}${sep}job=${id}`} />
      </div>

      {openJob && (
        <CustomerJobDrawer
          jobId={openJob}
          closeHref={base}
          customerId={customer.id}
          viewerId={me.id}
          viewerRole={me.role}
        />
      )}
    </>
  );
}
