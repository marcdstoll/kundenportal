import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { customerCoverUrl, customerLogoUrl, loadCustomers, loadJobs } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { NewUserForm } from "@/app/components/admin-forms";
import { CustomerCard } from "@/app/components/customer-profile";

const DONE = ["online", "storniert"];

// Kundenverwaltung (nur Admins): Galerie mit Titelbild, Nutzern und Projekten je Kunde
export default async function ClientsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");
  if (me.role !== "admin") redirect("/meine-clients"); // Verwaltung nur für Admins

  const [clients, jobs] = await Promise.all([loadCustomers(), loadJobs()]);

  return (
    <>
      <PageHeader title="Clients">
        <NewUserForm role="kunde" />
      </PageHeader>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 px-4 pb-10 sm:px-6 md:px-10">
        {clients.map((c) => {
          const own = jobs.filter((j) => j.customerId === c.id);
          const running = own.filter((j) => !DONE.includes(j.status)).length;
          const online = own.filter((j) => j.status === "online").length;
          const invited = c.members.filter((m) => m.invited).length;
          return (
            <CustomerCard
              key={c.id}
              href={`/clients/${c.id}`}
              id={c.id}
              name={c.name}
              coverUrl={customerCoverUrl(c)}
              logoUrl={customerLogoUrl(c)}
            >
              <p className="text-xs text-muted">
                {running} laufend · {online} online · {c.members.length} Nutzer
              </p>
              {invited > 0 && (
                <span className="self-start rounded bg-[var(--st-ready_to_post)]/15 px-2 py-0.5 text-xs text-[var(--st-ready_to_post)]">
                  {invited === 1 ? "1 Einladung offen" : `${invited} Einladungen offen`}
                </span>
              )}
            </CustomerCard>
          );
        })}
        {clients.length === 0 && <p className="text-sm text-muted">Noch keine Clients. Leg oben den ersten an.</p>}
      </div>
    </>
  );
}
