import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { jobCutters, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { listUsers } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { Person } from "@/app/components/ui";
import { ActiveToggle } from "@/app/components/active-toggle";

export default function CutterPage() {
  return (
    <Content />
  );
}

const OPEN = ["in_arbeit", "feedback"];

async function Content() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");

  const people = await listUsers("cutter", "admin");

  // Anzahl offener Projekte je Cutter
  const open = await db
    .select({ userId: jobCutters.userId })
    .from(jobCutters)
    .innerJoin(jobs, eq(jobCutters.jobId, jobs.id))
    .where(and(inArray(jobs.status, OPEN)));
  const openCount = (id: string) => open.filter((o) => o.userId === id).length;

  // Aktive zuerst
  const sorted = [...people].sort((a, b) => Number(b.active ?? true) - Number(a.active ?? true));

  return (
    <>
      <PageHeader title="Cutter" />
      <div className="px-6 pb-10 md:px-10">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">E-Mail</th>
                <th className="px-4 py-2.5 font-medium">Offene Projekte</th>
                <th className="px-4 py-2.5 font-medium">Aktiv</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((p) => (
                <tr key={p.id} className={p.active === false ? "text-muted" : ""}>
                  <td className="px-4 py-2.5">
                    <Person name={p.name} />
                    {p.role === "admin" && <span className="ml-2 text-xs text-muted">Admin</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{p.email}</td>
                  <td className="px-4 py-2.5">{openCount(p.id)}</td>
                  <td className="px-4 py-2.5">
                    <ActiveToggle
                      userId={p.id}
                      active={p.active ?? true}
                      editable={me.role === "admin" || me.id === p.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Aktiv heißt: gerade verfügbar für neue Projekte. Jeder Cutter kann das für sich selbst umschalten.
        </p>
      </div>
    </>
  );
}
