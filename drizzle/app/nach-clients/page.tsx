import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { jobs as jobsTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { listUsers, loadJobs } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { JobTable, PersonTabs } from "@/app/components/job-table";
import { JobDrawer } from "@/app/components/job-drawer";

export default function NachClientsPage({ searchParams }: PageProps<"/nach-clients">) {
  return (
    <Content searchParams={searchParams} />
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/nach-clients">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");

  const params = await searchParams;
  const clients = await listUsers("kunde");
  const requested = typeof params.c === "string" ? params.c : null;
  const activeId = clients.find((c) => c.id === requested)?.id ?? clients[0]?.id ?? null;
  const openJob = typeof params.job === "string" ? params.job : null;

  const jobs = activeId ? await loadJobs(eq(jobsTable.customerId, activeId)) : [];
  const base = activeId ? `/nach-clients?c=${activeId}` : "/nach-clients";

  return (
    <>
      <PageHeader title="Projekte nach Clients" />
      <div className="space-y-4 px-6 pb-10 md:px-10">
        <PersonTabs people={clients} activeId={activeId} hrefFor={(id) => `/nach-clients?c=${id}`} />
        <JobTable jobs={jobs} isAdmin={me.role === "admin"} hrefFor={(id) => `${base}&job=${id}`} />
      </div>
      {openJob && <JobDrawer jobId={openJob} closeHref={base} me={me} />}
    </>
  );
}
