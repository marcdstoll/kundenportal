import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { jobs as jobsTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { clientIdsOfCutter } from "@/lib/access";
import { customerCoverUrl, customerLogoUrl, loadCustomers, loadJobs } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { CustomerCard } from "@/app/components/customer-profile";

const DONE = ["online", "storniert"];

// Für Cutter: die betreuten Kunden als Galerie – Klick öffnet die Detailansicht mit Links und Infos
export default async function MeineClientsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/uebersicht");
  if (me.role === "admin") redirect("/clients");

  const ids = await clientIdsOfCutter(me.id);
  const [clients, jobs] = await Promise.all([
    loadCustomers(ids),
    ids.length ? loadJobs(inArray(jobsTable.customerId, ids)) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Meine Clients" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 px-4 pb-10 sm:px-6 md:px-10">
        {clients.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
            Dir sind noch keine Kunden zugeordnet. Die Admins geben dich für Kunden frei.
          </div>
        )}
        {clients.map((c) => {
          const open = jobs.filter((j) => j.customerId === c.id && !DONE.includes(j.status)).length;
          return (
            <CustomerCard
              key={c.id}
              href={`/kundenprofil/${c.id}`}
              id={c.id}
              name={c.name}
              coverUrl={customerCoverUrl(c)}
              logoUrl={customerLogoUrl(c)}
            >
              <p className="text-xs text-muted">{open === 1 ? "1 offenes Projekt" : `${open} offene Projekte`}</p>
            </CustomerCard>
          );
        })}
      </div>
    </>
  );
}
