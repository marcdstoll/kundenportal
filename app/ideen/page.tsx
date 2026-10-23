import Link from "next/link";
import { redirect } from "next/navigation";
import { count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ideaAttachments, ideaComments, ideaVotes, projectIdeas, user, customers } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { clientLogos, listCustomers, loadViewFilters, unreadByJob } from "@/lib/queries";
import { clientIdsOfCutter } from "@/lib/access";
import {
  IDEA_STATUSES,
  IDEA_STATUS_LABELS,
  PRIORITIES,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  PRIORITY_RANK,
} from "@/lib/ideas";
import { PageHeader } from "@/app/components/shell";
import { ClientFilter } from "@/app/components/client-filter";
import { FilterButton } from "@/app/components/filter-button";
import { Person } from "@/app/components/ui";
import { IdeaVoteButton, NewIdeaForm } from "./idea-forms";
import { IdeaDrawer, IdeaStatusBadge, PriorityBadge, fmtDay } from "./idea-drawer";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function IdeasPage({ searchParams }: { searchParams: Params }) {
  return <Content searchParams={searchParams} />;
}

// Projekt-Ideen je Kunde – aufgebaut wie das Featureboard.
// Sehen: der Kunde selbst, für ihn freigegebene Cutter, Admins. Meiste Stimmen oben.
// Oben rechts: Kunden-Filter (Team) und Prioritäts-Filter. Darunter Status-Reiter.
// Alle drei werden pro Nutzer gespeichert (eigene Werte, unabhängig von Board und Kalender).
async function Content({ searchParams }: { searchParams: Params }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const params = await searchParams;
  const isKunde = me.role === "kunde";
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const saved = await loadViewFilters(me.id, "ideen");

  // Sichtbare Kunden (+ Filter)
  let clients: { id: string; name: string }[] = [];
  let scope: string[] | null = null; // null = alle
  let pickedClients: string[] = [];
  if (isKunde) {
    scope = me.customerId ? [me.customerId] : [];
  } else {
    const all = await listCustomers();
    const allowed = me.role === "cutter" ? await clientIdsOfCutter(me.id) : null;
    clients = (allowed ? all.filter((c) => allowed.includes(c.id)) : all).map((c) => ({ id: c.id, name: c.name }));
    const picked = (saved.k ?? "").split(",").filter((id) => clients.some((c) => c.id === id));
    scope = picked.length > 0 ? picked : allowed;
    pickedClients = picked;
  }

  const allPrios = PRIORITIES as readonly string[];
  const prioPicked = (saved.p ?? "").split(",").filter((p) => allPrios.includes(p));
  const prios = prioPicked.length > 0 ? prioPicked : [...allPrios];
  const status = (IDEA_STATUSES as readonly string[]).includes(saved.s ?? "") ? (saved.s ?? "") : "";
  const openId = one("i") || null;

  const query = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const q = p.toString();
    return q ? `/ideen?${q}` : "/ideen";
  };

  const where = scope === null ? undefined : inArray(projectIdeas.customerId, scope.length ? scope : ["-"]);
  const [ideas, votes, myVotes, comments, images, unread, logos] = await Promise.all([
    db.select().from(projectIdeas).where(where).orderBy(desc(projectIdeas.createdAt)),
    db.select({ id: ideaVotes.ideaId, n: count() }).from(ideaVotes).groupBy(ideaVotes.ideaId),
    db.select({ id: ideaVotes.ideaId }).from(ideaVotes).where(eq(ideaVotes.userId, me.id)),
    db.select({ id: ideaComments.ideaId, n: count() }).from(ideaComments).groupBy(ideaComments.ideaId),
    db.select({ id: ideaAttachments.ideaId, n: count() }).from(ideaAttachments).groupBy(ideaAttachments.ideaId),
    unreadByJob(me.id).then((u) => u.ideas),
    clientLogos(),
  ]);
  const voteCount = new Map(votes.map((v) => [v.id, v.n]));
  const voted = new Set(myVotes.map((v) => v.id));
  const commentCount = new Map(comments.map((c) => [c.id, c.n]));
  const imageCount = new Map(images.map((c) => [c.id, c.n]));

  // Namen: Ersteller (Personen) und Kunden (Firmen)
  const nameIds = [...new Set(ideas.map((i) => i.createdBy).filter(Boolean))] as string[];
  const firmIds = [...new Set(ideas.map((i) => i.customerId))];
  const names = new Map([
    ...(nameIds.length
      ? (await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, nameIds))).map(
          (u) => [u.id, u.name] as const,
        )
      : []),
    ...(firmIds.length
      ? (
          await db
            .select({ id: customers.id, name: customers.name })
            .from(customers)
            .where(inArray(customers.id, firmIds))
        ).map((c) => [c.id, c.name] as const)
      : []),
  ]);

  // Zähler für Reiter (nach Priorität gefiltert) und Prioritäts-Chips (nach Status gefiltert)
  const inPrio = ideas.filter((i) => prios.includes(i.priority));
  const statusCount = (s: string) => inPrio.filter((i) => !s || i.status === s).length;
  const prioCount = (p: string) => ideas.filter((i) => i.priority === p && (!status || i.status === status)).length;

  // Meiste Stimmen oben, dann höhere Priorität, dann die neueste
  const list = inPrio
    .filter((i) => !status || i.status === status)
    .sort(
      (a, b) =>
        (voteCount.get(b.id) ?? 0) - (voteCount.get(a.id) ?? 0) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    );

  return (
    <>
      <PageHeader title="Projekt-Ideen">
        {clients.length > 0 && <ClientFilter view="ideen" clients={clients} selected={pickedClients} />}
        <PriorityFilter active={prios} counts={prioCount} />
      </PageHeader>

      <div className="space-y-4 px-4 pb-10 sm:px-6 md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {isKunde ? (
            <p className="max-w-2xl text-sm text-muted">
              Halte hier deine Ideen für kommende Videos fest. Vote für das, was dir am wichtigsten ist – wir sehen es
              und melden uns.
            </p>
          ) : (
            <span />
          )}
          <NewIdeaForm clients={isKunde ? null : clients} />
        </div>

        <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Ideen nach Status">
          {[
            { value: "", label: "Alle" },
            ...IDEA_STATUSES.map((s) => ({ value: s, label: IDEA_STATUS_LABELS[s] })),
          ].map((t) => {
            const active = t.value === status;
            return (
              <FilterButton
                key={t.label}
                view="ideen"
                patch={{ s: t.value }}
                aria-current={active ? "page" : undefined}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                  active ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text"
                }`}
              >
                {t.label} <span className="text-xs text-muted">{statusCount(t.value)}</span>
              </FilterButton>
            );
          })}
        </nav>

        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
            {ideas.length === 0
              ? isKunde
                ? "Noch keine Ideen. Über „+ Neue Idee“ hältst du deine erste fest."
                : "Noch keine Ideen."
              : "Keine Ideen mit diesem Filter."}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="Ideen">
            {list.map((i) => {
              const isNew = !!unread.get(i.id);
              const nComments = commentCount.get(i.id) ?? 0;
              const nImages = imageCount.get(i.id) ?? 0;
              const customerName = names.get(i.customerId) ?? "–";
              return (
                <li
                  key={i.id}
                  className="flex items-center gap-3 bg-surface px-3 py-3 sm:gap-4 sm:px-4"
                  data-testid="idea-row"
                >
                  <IdeaVoteButton ideaId={i.id} count={voteCount.get(i.id) ?? 0} voted={voted.has(i.id)} />
                  <Link
                    href={query({ i: i.id })}
                    scroll={false}
                    className={`group flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-md ${
                      openId === i.id ? "text-accent" : ""
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium leading-snug group-hover:underline">
                        <span className="min-w-0 break-words">{i.title}</span>
                        {isNew && (
                          <span
                            className="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white"
                            style={{ background: "var(--rec)" }}
                            title="Neue Einträge in der Inbox"
                          >
                            Neu
                          </span>
                        )}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                        {!isKunde && <Person name={customerName} id={i.customerId} logoUrl={logos.get(i.customerId)} />}
                        <span>
                          Von {i.createdBy === me.id ? "dir" : i.createdBy ? (names.get(i.createdBy) ?? "–") : "–"}
                        </span>
                        <span>Erstellt {fmtDay(i.createdAt)}</span>
                        {i.doneAt && <span>Abgeschlossen {fmtDay(i.doneAt)}</span>}
                        {nComments > 0 && <span title="Kommentare">💬 {nComments}</span>}
                        {nImages > 0 && <span title="Screenshots">🖼 {nImages}</span>}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <PriorityBadge priority={i.priority} />
                      <IdeaStatusBadge status={i.status} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {openId && (
        <IdeaDrawer ideaId={openId} closeHref={query({ i: "" })} me={me} imageError={one("bild") === "fehler"} />
      )}
    </>
  );
}

// Filter-Chips wie beim Featureboard: Klick zeigt nur diese Priorität, weitere dazu- bzw. wegschalten
function PriorityFilter({ active, counts }: { active: string[]; counts: (p: string) => number }) {
  const all = PRIORITIES as readonly string[];
  const allOn = active.length === all.length;
  const nextFor = (value: string) => {
    const isOn = active.includes(value);
    let next = allOn ? [value] : isOn ? active.filter((s) => s !== value) : [...active, value];
    if (next.length === 0 || next.length === all.length) next = [];
    return all.filter((s) => next.includes(s)).join(",");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Priorität filtern">
      {PRIORITIES.map((p) => {
        const on = active.includes(p) && !allOn;
        const color = PRIORITY_COLORS[p];
        return (
          <FilterButton
            key={p}
            view="ideen"
            patch={{ p: nextFor(p) }}
            aria-pressed={active.includes(p)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
              on
                ? "text-text"
                : allOn
                  ? "border-line text-muted hover:text-text"
                  : "border-line text-muted/60 hover:text-text"
            }`}
            style={
              on ? { borderColor: color, background: `color-mix(in oklab, ${color} 14%, transparent)` } : undefined
            }
          >
            <span className="size-2 rounded-full" style={{ background: color, opacity: allOn || on ? 1 : 0.4 }} />
            {PRIORITY_LABELS[p]}
            <span className="text-xs text-muted">{counts(p)}</span>
          </FilterButton>
        );
      })}
      {!allOn && (
        <FilterButton view="ideen" patch={{ p: "" }} className="px-2 text-xs text-muted hover:text-text">
          Alle
        </FilterButton>
      )}
    </div>
  );
}
