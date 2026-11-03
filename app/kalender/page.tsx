import { redirect } from "next/navigation";
import { and, eq, isNotNull } from "drizzle-orm";
import { jobs as jobsTable } from "@/db/schema";
import { getCurrentUser, resolveCustomerView } from "@/lib/session";
import { listCustomers, loadJobs, loadViewFilters } from "@/lib/queries";
import { calendarLockReason } from "@/lib/calendar-lock";
import { ClientFormatChips, ClientFormatFilter } from "@/app/components/client-format-filter";
import { decodeMatrix, matrixShows } from "@/lib/client-format-filter";
import { both, clientIdsOfCutter, jobScope } from "@/lib/access";
import { PageHeader, ViewAsBanner } from "@/app/components/shell";
import { Calendar, monthKey, parseMonth } from "@/app/components/calendar";
import { CustomerJobDrawer, JobDrawer } from "@/app/components/job-drawer";

export default function KalenderPage({ searchParams }: PageProps<"/kalender">) {
  return <Content searchParams={searchParams} />;
}

async function Content({ searchParams }: { searchParams: PageProps<"/kalender">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const params = await searchParams;
  const asParam = typeof params.as === "string" ? params.as : undefined;
  const month = parseMonth(typeof params.m === "string" ? params.m : undefined);
  const openJob = typeof params.job === "string" ? params.job : null;

  // Kunden (und Admins in der Kundenansicht) sehen nur die eigenen Projekte
  const customerView =
    me.role === "kunde" || (me.role === "admin" && asParam) ? await resolveCustomerView(me, asParam) : null;
  const customerId = customerView?.customer.id ?? null;

  // Staff: optionaler Kunden-Filter (gespeichert pro Nutzer, unabhängig vom Board), Kunden sehen ohnehin nur sich selbst
  // Cutter sehen im Filter nur ihre freigegebenen Kunden
  const allClients = customerId ? [] : await listCustomers();
  const allowed = me.role === "cutter" ? await clientIdsOfCutter(me.id) : null;
  const clients = allowed ? allClients.filter((c) => allowed.includes(c.id)) : allClients;
  const saved = clients.length > 0 ? await loadViewFilters(me.id, "kalender") : {};
  // Multifilter Kunde × Format (eigene Auswahl, unabhängig vom Board)
  const filterClients = clients.map((c) => ({ id: c.id, name: c.name }));
  const matrix = decodeMatrix(saved, filterClients.map((c) => c.id));

  const filter = customerId
    ? and(isNotNull(jobsTable.publishDate), eq(jobsTable.customerId, customerId))
    : isNotNull(jobsTable.publishDate);
  const jobs = (await loadJobs(me.role === "cutter" ? both(await jobScope(me), filter) : filter)).filter(
    (j) => customerId || matrixShows(matrix, j),
  );

  const lockReason = calendarLockReason(me);

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
      <div className="space-y-3 px-4 pb-10 sm:px-6 md:px-10">
        {filterClients.length > 0 && <ClientFormatChips view="kalender" clients={filterClients} matrix={matrix} />}
        <Calendar
          month={month}
          jobs={jobs}
          showClient={!customerId}
          lockReason={lockReason}
          toolbar={
            filterClients.length > 0 ? (
              <ClientFormatFilter view="kalender" clients={filterClients} matrix={matrix} />
            ) : null
          }
          hrefFor={(id) => query({ job: id })}
          monthHref={(key) => query({ m: key })}
        />
      </div>
      {openJob &&
        (customerId ? (
          <CustomerJobDrawer
            jobId={openJob}
            closeHref={query({})}
            customerId={customerId}
            viewerId={me.id}
            viewerRole={me.role}
          />
        ) : (
          <JobDrawer jobId={openJob} closeHref={query({})} me={me} />
        ))}
    </>
  );
}
