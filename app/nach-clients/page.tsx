import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { jobs as jobsTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { listCustomers, loadJobs, loadViewFilters, clientLogos } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { JobTable, PersonTabs, parseSort } from "@/app/components/job-table";
import { JobDrawer } from "@/app/components/job-drawer";

export default function NachClientsPage({ searchParams }: PageProps<"/nach-clients">) {
  return <Content searchParams={searchParams} />;
}

async function Content({ searchParams }: { searchParams: PageProps<"/nach-clients">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");
  if (me.role !== "admin") redirect("/meine-clients"); // Verwaltung nur für Admins

  const params = await searchParams;
  const logos = await clientLogos();
  const clients = await listCustomers();
  // Gewählte Person und Sortierung sind pro Nutzer gespeichert
  const saved = await loadViewFilters(me.id, "nach-clients");
  const requested = saved.c ?? null;
  const activeId = clients.find((c) => c.id === requested)?.id ?? clients[0]?.id ?? null;
  const openJob = typeof params.job === "string" ? params.job : null;

  const jobs = activeId ? await loadJobs(eq(jobsTable.customerId, activeId)) : [];
  const sort = parseSort(saved.s, saved.d);
  const base = "/nach-clients";

  return (
    <>
      <PageHeader title="Projekte nach Clients" />
      <div className="space-y-4 px-4 pb-10 sm:px-6 md:px-10">
        <PersonTabs logos={logos} people={clients} activeId={activeId} view="nach-clients" />
        <JobTable
          logos={logos}
          jobs={jobs}
          isAdmin={me.role === "admin"}
          sort={sort}
          view="nach-clients"
          hrefFor={(id) => `${base}?job=${id}`}
        />
      </div>
      {openJob && <JobDrawer jobId={openJob} closeHref={base} me={me} />}
    </>
  );
}
