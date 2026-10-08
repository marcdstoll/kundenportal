import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listUsers, loadJobsOfCutter } from "@/lib/queries";
import { Shell, PageHeader } from "@/app/components/shell";
import { JobTable, PersonTabs } from "@/app/components/job-table";
import { JobDrawer } from "@/app/components/job-drawer";

export default function NachCutterPage({ searchParams }: PageProps<"/nach-cutter">) {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Lade…</p>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/nach-cutter">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");

  const params = await searchParams;
  const cutters = await listUsers("cutter", "admin");
  // Standard: man selbst (falls Cutter), sonst der erste Cutter
  const requested = typeof params.c === "string" ? params.c : null;
  const activeId =
    cutters.find((c) => c.id === requested)?.id ??
    (me.role === "cutter" ? me.id : null) ??
    cutters.find((c) => c.role === "cutter")?.id ??
    cutters[0]?.id ??
    null;
  const openJob = typeof params.job === "string" ? params.job : null;

  const jobs = activeId ? await loadJobsOfCutter(activeId) : [];
  const base = activeId ? `/nach-cutter?c=${activeId}` : "/nach-cutter";

  return (
    <Shell user={me}>
      <PageHeader title="Projekte nach Cutter" />
      <div className="space-y-4 px-6 pb-10 md:px-10">
        <PersonTabs people={cutters} activeId={activeId} hrefFor={(id) => `/nach-cutter?c=${id}`} />
        <JobTable jobs={jobs} isAdmin={me.role === "admin"} hrefFor={(id) => `${base}&job=${id}`} />
      </div>
      {openJob && <JobDrawer jobId={openJob} closeHref={base} me={me} />}
    </Shell>
  );
}
