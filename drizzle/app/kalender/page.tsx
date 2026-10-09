import { redirect } from "next/navigation";
import { and, eq, isNotNull } from "drizzle-orm";
import { jobs as jobsTable } from "@/db/schema";
import { getCurrentUser, resolveCustomerView } from "@/lib/session";
import { loadJobs } from "@/lib/queries";
import { PageHeader, ViewAsBanner } from "@/app/components/shell";
import { Calendar, monthKey, parseMonth } from "@/app/components/calendar";
import { CustomerJobDrawer, JobDrawer } from "@/app/components/job-drawer";

export default function KalenderPage({ searchParams }: PageProps<"/kalender">) {
  return (
    <Content searchParams={searchParams} />
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/kalender">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const params = await searchParams;
  const asParam = typeof params.as === "string" ? params.as : undefined;
  const month = parseMonth(typeof params.m === "string" ? params.m : undefined);
  const openJob = typeof params.job === "string" ? params.job : null;

  // Kunden (und Admins in der Kundenansicht) sehen nur die eigenen Projekte
  const customerView = me.role === "kunde" || (me.role === "admin" && asParam) ? await resolveCustomerView(me, asParam) : null;
  const customerId = customerView?.customer.id ?? null;

  const filter = customerId
    ? and(isNotNull(jobsTable.publishDate), eq(jobsTable.customerId, customerId))
    : isNotNull(jobsTable.publishDate);
  const jobs = await loadJobs(filter);

  const query = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (customerView?.viewAs) p.set("as", customerView.viewAs.id);
    p.set("m", monthKey(month));
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/kalender?${p}`;
  };

  return (
    <>
      <ViewAsBanner viewAs={customerView?.viewAs ?? null} />
      <PageHeader title="Kalender" />
      <div className="px-6 pb-10 md:px-10">
        <Calendar
          month={month}
          jobs={jobs}
          showClient={!customerId}
          hrefFor={(id) => query({ job: id })}
          monthHref={(key) => query({ m: key })}
        />
        <p className="mt-3 text-xs text-muted">
          Zu sehen sind alle Projekte mit eingetragenem Veröffentlichungsdatum.
        </p>
      </div>
      {openJob &&
        (customerId ? (
          <CustomerJobDrawer jobId={openJob} closeHref={query({})} customerId={customerId} />
        ) : (
          <JobDrawer jobId={openJob} closeHref={query({})} me={me} />
        ))}
    </>
  );
}
