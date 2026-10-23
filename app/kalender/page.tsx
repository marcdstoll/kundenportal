import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { jobs as jobsTable } from "@/db/schema";
import { getCurrentUser, resolveCustomerView } from "@/lib/session";
import { listCustomers, loadJobs, loadViewFilters } from "@/lib/queries";
import { CUSTOMER_DATE_STATUSES } from "@/lib/status";
import { ClientFilter } from "@/app/components/client-filter";
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
  const pickedClients = (saved.k ?? "").split(",").filter((id) => clients.some((c) => c.id === id));

  const filter = customerId
    ? and(isNotNull(jobsTable.publishDate), eq(jobsTable.customerId, customerId))
    : pickedClients.length > 0
      ? and(isNotNull(jobsTable.publishDate), inArray(jobsTable.customerId, pickedClients))
      : isNotNull(jobsTable.publishDate);
  const jobs = await loadJobs(me.role === "cutter" ? both(await jobScope(me), filter) : filter);

  // Verschieben: Admins immer, Kunden ihre eigenen Projekte ab "Ready to post", Cutter nie.
  // Rückgabe: null = darf verschieben, sonst der Grund, warum nicht (erscheint als Hinweis am Termin)
  const lockReason = (job: { customerId: string; status: string }) => {
    if (me.role === "admin") return null;
    if (me.role === "cutter") return "Termine verschieben nur Admins und Kunden.";
    if (job.customerId !== me.customerId) return "Nur eigene Projekte lassen sich verschieben.";
    if (!CUSTOMER_DATE_STATUSES.includes(job.status)) return "Das Datum lässt sich ab „Ready to post“ ändern.";
    return null;
  };

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
      <div className="px-4 pb-10 sm:px-6 md:px-10">
        <Calendar
          month={month}
          jobs={jobs}
          showClient={!customerId}
          lockReason={lockReason}
          toolbar={
            clients.length > 0 ? (
              <ClientFilter
                view="kalender"
                clients={clients.map((c) => ({ id: c.id, name: c.name }))}
                selected={pickedClients}
              />
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
