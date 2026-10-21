import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { jobCutters, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { loadAssignments, loadPeople, logoUrl } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { Avatar } from "@/app/components/ui";
import { ActiveToggle } from "@/app/components/active-toggle";
import { NewUserForm } from "@/app/components/admin-forms";

const OPEN = ["warteschlange", "in_arbeit", "feedback", "feedback_client"];

// Cutter-Verwaltung (nur Admins): Verfügbarkeit, Kontakt, freigegebene Kunden, offene Projekte
export default async function CutterPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");
  if (me.role !== "admin") redirect("/meine-clients"); // Verwaltung nur für Admins

  const [people, clients, assignments, open] = await Promise.all([
    loadPeople("cutter", "admin"),
    loadPeople("kunde"),
    loadAssignments(),
    db
      .select({ userId: jobCutters.userId })
      .from(jobCutters)
      .innerJoin(jobs, eq(jobCutters.jobId, jobs.id))
      .where(inArray(jobs.status, OPEN)),
  ]);
  const openCount = (id: string) => open.filter((o) => o.userId === id).length;
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const sorted = [...people].sort((a, b) => Number(b.active ?? true) - Number(a.active ?? true));

  return (
    <>
      <PageHeader title="Cutter">
        <NewUserForm role="cutter" />
      </PageHeader>
      <div className="px-4 pb-10 sm:px-6 md:px-10">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">Kontakt</th>
                <th className="px-4 py-2.5 font-medium">Freigegebene Kunden</th>
                <th className="px-4 py-2.5 font-medium">Offen</th>
                <th className="px-4 py-2.5 font-medium">Aktiv</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((p) => {
                const own = assignments
                  .filter((a) => a.cutterId === p.id)
                  .map((a) => clientName.get(a.clientId))
                  .filter(Boolean);
                return (
                  <tr key={p.id} className={p.active === false ? "text-muted" : ""}>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/cutter/${p.id}`}
                        className="inline-flex items-center gap-2 font-medium hover:underline"
                      >
                        <Avatar name={p.name} id={p.id} logoUrl={logoUrl(p)} />
                        {p.name}
                      </Link>
                      {p.role === "admin" && <span className="ml-2 text-xs text-muted">Admin</span>}
                      {p.invited && <span className="ml-2 text-xs text-[var(--st-ready_to_post)]">eingeladen</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      <div>{p.email}</div>
                      {p.phone && <div className="text-xs">{p.phone}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {p.role === "admin" ? "alle (Admin)" : own.join(", ") || "–"}
                    </td>
                    <td className="px-4 py-2.5">{openCount(p.id)}</td>
                    <td className="px-4 py-2.5">
                      <ActiveToggle userId={p.id} active={p.active ?? true} editable />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
