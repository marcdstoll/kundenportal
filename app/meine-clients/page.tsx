import Link from "next/link";
import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { jobs as jobsTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { clientIdsOfCutter } from "@/lib/access";
import { loadJobs, loadPeople, logoUrl } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { Avatar, StatusBadge } from "@/app/components/ui";

const DONE = ["online", "storniert"];

// Links als klickbare Einträge (eine pro Zeile; ohne http wird https ergänzt)
function LinkList({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <ul className="space-y-1 text-sm">
      {lines.map((l) => {
        const href = /^https?:\/\//i.test(l) ? l : `https://${l}`;
        return (
          <li key={l} className="truncate">
            <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              {l.replace(/^https?:\/\/(www\.)?/i, "")}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

// Für Cutter: die betreuten Kunden mit Infos, Links und offenen Projekten
export default async function MeineClientsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");
  if (me.role === "admin") redirect("/clients");

  const ids = await clientIdsOfCutter(me.id);
  const [clients, jobs] = await Promise.all([
    ids.length ? loadPeople("kunde").then((all) => all.filter((c) => ids.includes(c.id))) : Promise.resolve([]),
    ids.length ? loadJobs(inArray(jobsTable.customerId, ids)) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Meine Clients" />
      <div className="grid gap-4 px-4 pb-10 sm:px-6 md:px-10 xl:grid-cols-2">
        {clients.length === 0 && (
          <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
            Dir sind noch keine Kunden zugeordnet. Die Admins geben dich für Kunden frei.
          </div>
        )}
        {clients.map((c) => {
          const open = jobs.filter((j) => j.customerId === c.id && !DONE.includes(j.status));
          return (
            <section key={c.id} className="space-y-4 rounded-xl border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <Avatar name={c.name} size="lg" logoUrl={logoUrl(c)} />
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{c.name}</h2>
                  <p className="text-sm text-muted">{open.length} offene Projekte</p>
                </div>
              </div>
              {c.notes && (
                <div className="space-y-1">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Infos</h3>
                  <p className="whitespace-pre-wrap text-sm">{c.notes}</p>
                </div>
              )}
              {c.links && (
                <div className="space-y-1">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Links</h3>
                  <LinkList text={c.links} />
                </div>
              )}
              {!c.notes && !c.links && <p className="text-sm text-muted">Noch keine Infos hinterlegt.</p>}
              {open.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Offene Projekte</h3>
                  <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                    {open.map((j) => (
                      <li key={j.id}>
                        <Link
                          href={`/board?job=${j.id}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-raised/50"
                        >
                          <span className="truncate">{j.title}</span>
                          <StatusBadge status={j.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
