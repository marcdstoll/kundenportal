import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { projectIdeas, user } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { clientLogos, listUsers } from "@/lib/queries";
import { clientIdsOfCutter } from "@/lib/access";
import { PageHeader } from "@/app/components/shell";
import { ClientFilter } from "@/app/components/client-filter";
import { Avatar } from "@/app/components/ui";
import { DeleteIdeaButton, IdeaCheck, NewIdeaForm } from "./idea-forms";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function IdeasPage({ searchParams }: { searchParams: Params }) {
  return <Content searchParams={searchParams} />;
}

const fmt = (d: Date) => d.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });

// Projekt-Ideen: Kunden sehen ihre eigenen, Cutter die ihrer freigegebenen Kunden, Admins alle.
// Zwei Tabs: Offen / Abgehakt. Staff kann nach Kunden filtern (?k=id1,id2).
async function Content({ searchParams }: { searchParams: Params }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const params = await searchParams;
  const showDone = params.tab === "abgehakt";
  const isKunde = me.role === "kunde";

  // Sichtbare Kunden + Filter
  let clients: { id: string; name: string }[] = [];
  let scope: SQL | undefined;
  if (isKunde) {
    scope = eq(projectIdeas.customerId, me.id);
  } else {
    const all = await listUsers("kunde");
    const allowed = me.role === "cutter" ? await clientIdsOfCutter(me.id) : null;
    clients = (allowed ? all.filter((c) => allowed.includes(c.id)) : all).map((c) => ({ id: c.id, name: c.name }));
    const picked =
      typeof params.k === "string" ? params.k.split(",").filter((id) => clients.some((c) => c.id === id)) : [];
    const ids = picked.length > 0 ? picked : allowed;
    if (ids) scope = inArray(projectIdeas.customerId, ids.length > 0 ? ids : ["-"]);
  }
  const picked = typeof params.k === "string" ? params.k : "";

  const [ideas, [openCount], [doneCount], logos] = await Promise.all([
    db
      .select()
      .from(projectIdeas)
      .where(and(scope, showDone ? isNotNull(projectIdeas.doneAt) : isNull(projectIdeas.doneAt)))
      .orderBy(showDone ? desc(projectIdeas.doneAt) : desc(projectIdeas.createdAt), asc(projectIdeas.title)),
    db
      .select({ n: count() })
      .from(projectIdeas)
      .where(and(scope, isNull(projectIdeas.doneAt))),
    db
      .select({ n: count() })
      .from(projectIdeas)
      .where(and(scope, isNotNull(projectIdeas.doneAt))),
    clientLogos(),
  ]);

  // Namen für Kunde und „abgehakt von“
  const nameIds = [...new Set(ideas.flatMap((i) => [i.customerId, i.doneBy]).filter((x): x is string => !!x))];
  const names = new Map(
    nameIds.length
      ? (await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, nameIds))).map((u) => [
          u.id,
          u.name,
        ])
      : [],
  );

  const tabHref = (done: boolean) => {
    const p = new URLSearchParams();
    if (done) p.set("tab", "abgehakt");
    if (picked) p.set("k", picked);
    const q = p.toString();
    return q ? `/ideen?${q}` : "/ideen";
  };
  const canDelete = me.role === "admin" || isKunde;

  return (
    <>
      <PageHeader title="Projekt-Ideen">
        {isKunde ? (
          <NewIdeaForm />
        ) : (
          clients.length > 0 && <ClientFilter clients={clients} selected={picked ? picked.split(",") : []} />
        )}
      </PageHeader>
      <div className="space-y-4 px-4 pb-10 sm:px-6 md:px-10">
        <nav className="flex gap-1 border-b border-line" aria-label="Ideen filtern">
          {[
            { done: false, label: "Offen", n: openCount.n },
            { done: true, label: "Abgehakt", n: doneCount.n },
          ].map((t) => {
            const active = t.done === showDone;
            return (
              <Link
                key={t.label}
                href={tabHref(t.done)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                  active ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text"
                }`}
              >
                {t.label} <span className="text-xs text-muted">{t.n}</span>
              </Link>
            );
          })}
        </nav>

        {ideas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
            {showDone
              ? "Noch nichts abgehakt."
              : isKunde
                ? "Noch keine Ideen. Über „+ Neue Idee“ hältst du deine erste fest."
                : "Keine offenen Ideen."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-surface text-xs text-muted">
                <tr>
                  <th className="w-10 px-4 py-2.5 font-medium">
                    <span className="sr-only">Abhaken</span>
                  </th>
                  <th className="px-4 py-2.5 font-medium">Titel</th>
                  <th className="px-4 py-2.5 font-medium">Notiz</th>
                  {!isKunde && <th className="px-4 py-2.5 font-medium">Kunde</th>}
                  <th className="px-4 py-2.5 font-medium">{showDone ? "Abgehakt" : "Erstellt"}</th>
                  {canDelete && (
                    <th className="w-10 px-4 py-2.5 font-medium">
                      <span className="sr-only">Löschen</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ideas.map((i) => (
                  <tr key={i.id} className={showDone ? "text-muted" : ""}>
                    <td className="px-4 py-3 align-top">
                      <IdeaCheck id={i.id} done={!!i.doneAt} title={i.title} />
                    </td>
                    <td className={`px-4 py-3 align-top font-medium ${showDone ? "line-through" : "text-text"}`}>
                      {i.title}
                    </td>
                    <td className="max-w-md px-4 py-3 align-top">
                      <p className="whitespace-pre-wrap text-muted">{i.note || "–"}</p>
                    </td>
                    {!isKunde && (
                      <td className="px-4 py-3 align-top">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <Avatar name={names.get(i.customerId) ?? "?"} logoUrl={logos.get(i.customerId)} />
                          {names.get(i.customerId) ?? "–"}
                        </span>
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3 align-top text-muted">
                      {showDone && i.doneAt ? (
                        <>
                          {fmt(i.doneAt)}
                          {i.doneBy && <span className="block text-xs">von {names.get(i.doneBy) ?? "–"}</span>}
                        </>
                      ) : (
                        fmt(i.createdAt)
                      )}
                    </td>
                    {canDelete && (
                      <td className="px-4 py-3 align-top">
                        <DeleteIdeaButton id={i.id} title={i.title} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
