import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listUsers, loadJobsOfCutter, clientLogos } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { JobTable, PersonTabs, parseSort } from "@/app/components/job-table";
import { JobDrawer } from "@/app/components/job-drawer";
import { ActiveToggle } from "@/app/components/active-toggle";

export default function NachCutterPage({ searchParams }: PageProps<"/nach-cutter">) {
  return <Content searchParams={searchParams} />;
}

async function Content({ searchParams }: { searchParams: PageProps<"/nach-cutter">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");

  const params = await searchParams;
  const logos = await clientLogos();
  // Cutter sehen nur sich selbst ("Meine Projekte"), Admins alle
  const isCutter = me.role === "cutter";
  const cutters = isCutter
    ? [
        {
          id: me.id,
          name: me.name,
          role: me.role,
          email: me.email,
          active: me.active,
        },
      ]
    : await listUsers("cutter", "admin");
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
  const sort = parseSort(params.s, params.d);
  const sortQuery = sort ? `&s=${sort.key}&d=${sort.dir}` : "";
  const base = activeId ? `/nach-cutter?c=${activeId}${sortQuery}` : "/nach-cutter";

  return (
    <>
      <PageHeader title={isCutter ? "Meine Projekte" : "Projekte nach Cutter"}>
        {isCutter && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <ActiveToggle userId={me.id} active={me.active ?? true} editable />
            Verfügbar für neue Projekte
          </label>
        )}
      </PageHeader>
      <div className="space-y-4 px-4 pb-10 sm:px-6 md:px-10">
        {!isCutter && (
          <PersonTabs
            logos={logos}
            people={cutters}
            activeId={activeId}
            hrefFor={(id) => `/nach-cutter?c=${id}${sortQuery}`}
          />
        )}
        <JobTable
          logos={logos}
          jobs={jobs}
          isAdmin={me.role === "admin"}
          sort={sort}
          sortHref={(key, dir) => `/nach-cutter?c=${activeId ?? ""}&s=${key}&d=${dir}`}
          hrefFor={(id) => `${base}&job=${id}`}
        />
      </div>
      {openJob && <JobDrawer jobId={openJob} closeHref={base} me={me} />}
    </>
  );
}
