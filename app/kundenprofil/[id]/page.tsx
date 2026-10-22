import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobCutters, jobs as jobsTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { clientIdsOfCutter } from "@/lib/access";
import { customerCoverUrl, customerLogoUrl, loadCustomer, loadJobs } from "@/lib/queries";
import { CustomerProfileView } from "@/app/components/customer-profile";
import { StatusBadge, buttonSecondary } from "@/app/components/ui";
import { BackLink } from "@/app/components/back-link";

const DONE = ["online", "storniert"];

// Detailansicht eines Kunden (nur lesen) – z. B. aus einem Projekt heraus geöffnet.
// Sehen dürfen: Admins, Cutter mit Freigabe oder Projekt bei diesem Kunden, die Nutzer des Kunden selbst.
export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { id } = await params;

  let allowed = me.role === "admin" || (me.role === "kunde" && me.customerId === id);
  if (!allowed && me.role === "cutter") {
    if ((await clientIdsOfCutter(me.id)).includes(id)) allowed = true;
    else {
      const [row] = await db
        .select({ id: jobsTable.id })
        .from(jobCutters)
        .innerJoin(jobsTable, eq(jobCutters.jobId, jobsTable.id))
        .where(and(eq(jobCutters.userId, me.id), eq(jobsTable.customerId, id)));
      allowed = !!row;
    }
  }
  if (!allowed) notFound();

  const customer = await loadCustomer(id);
  if (!customer) notFound();
  const isStaff = me.role !== "kunde";
  let open: Awaited<ReturnType<typeof loadJobs>> = [];
  if (isStaff) {
    const all = await loadJobs(eq(jobsTable.customerId, id));
    // Cutter ohne Freigabe für diesen Kunden sehen nur ihre eigenen Projekte
    const onlyOwn = me.role === "cutter" && !(await clientIdsOfCutter(me.id)).includes(id);
    open = all.filter((j) => !DONE.includes(j.status) && (!onlyOwn || j.cutters.some((c) => c.id === me.id)));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink fallback={isStaff ? "/board" : "/kunde"} />
        {me.role === "admin" && (
          <Link href={`/clients/${id}`} className={buttonSecondary}>
            Bearbeiten
          </Link>
        )}
        {me.role === "kunde" && (
          <Link href="/team" className={buttonSecondary}>
            Team
          </Link>
        )}
      </div>
      <CustomerProfileView
        customer={customer}
        coverUrl={customerCoverUrl(customer)}
        logoUrl={customerLogoUrl(customer)}
      />
      {isStaff && open.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Offene Projekte</h3>
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {open.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/board?job=${j.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-raised/50"
                >
                  <span className="truncate">{j.title}</span>
                  <StatusBadge status={j.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
