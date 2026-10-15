import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadAssignments, loadJobs, loadPeople, logoUrl } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { Avatar } from "@/app/components/ui";
import { NewUserForm } from "@/app/components/admin-forms";

const DONE = ["online", "storniert"];

// Kundenverwaltung (nur Admins): Logo, Kontakt, betreuende Cutter, Einladungsstatus
export default async function ClientsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");
  if (me.role !== "admin") redirect("/meine-clients"); // Verwaltung nur für Admins

  const [clients, cutters, assignments, jobs] = await Promise.all([
    loadPeople("kunde"),
    loadPeople("cutter"),
    loadAssignments(),
    loadJobs(),
  ]);
  const cutterName = new Map(cutters.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="Clients">
        <NewUserForm role="kunde" />
      </PageHeader>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3 px-4 pb-10 sm:px-6 md:px-10">
        {clients.map((c) => {
          const own = jobs.filter((j) => j.customerId === c.id);
          const running = own.filter((j) => !DONE.includes(j.status)).length;
          const online = own.filter((j) => j.status === "online").length;
          const team = assignments
            .filter((a) => a.clientId === c.id)
            .map((a) => cutterName.get(a.cutterId))
            .filter(Boolean);
          return (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-muted/40"
            >
              <div className="flex items-center gap-3">
                <Avatar name={c.name} size="lg" logoUrl={logoUrl(c)} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted">{c.email}</p>
                  {c.phone && <p className="truncate text-xs text-muted">{c.phone}</p>}
                </div>
              </div>
              <p className="text-sm text-muted">
                {running} laufend · {online} online
              </p>
              <p className="text-xs text-muted">{team.length ? `Cutter: ${team.join(", ")}` : "Noch kein Cutter freigegeben"}</p>
              {c.invited && (
                <span className="self-start rounded bg-[var(--st-ready_to_post)]/15 px-2 py-0.5 text-xs text-[var(--st-ready_to_post)]">
                  Eingeladen – Passwort noch nicht gesetzt
                </span>
              )}
            </Link>
          );
        })}
        {clients.length === 0 && <p className="text-sm text-muted">Noch keine Clients. Leg oben den ersten an.</p>}
      </div>
    </>
  );
}
