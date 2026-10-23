import Link from "next/link";
import { redirect } from "next/navigation";
import { count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { featureAttachments, featureComments, featureRequests, featureVotes, user } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { loadViewFilters, unreadByJob } from "@/lib/queries";
import { FEATURE_STATUSES, FEATURE_STATUS_COLORS, FEATURE_STATUS_LABELS } from "@/lib/features";
import { PageHeader } from "@/app/components/shell";
import { FilterButton } from "@/app/components/filter-button";
import { NewFeatureForm, VoteButton } from "./feature-forms";
import { FeatureBadge, FeatureDrawer, fmtDay } from "./feature-drawer";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function FeatureboardPage({ searchParams }: { searchParams: Params }) {
  return <Content searchParams={searchParams} />;
}

// Featureboard: alle sehen alle Vorschläge (anonym – Namen nur für Admins), sortiert nach Stimmen.
// Filter oben rechts nach Status (pro Nutzer gespeichert), geöffneter Vorschlag über ?f=ID.
async function Content({ searchParams }: { searchParams: Params }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const isAdmin = me.role === "admin";
  const params = await searchParams;
  const all = FEATURE_STATUSES as readonly string[];
  const saved = await loadViewFilters(me.id, "featureboard");
  const picked = (saved.s ?? "").split(",").filter((s) => all.includes(s));
  const active = picked.length > 0 ? picked : [...all];
  const openId = typeof params.f === "string" ? params.f : null;
  const href = (extra?: string) => (extra ? `/featureboard?${extra}` : "/featureboard");

  const [features, votes, myVotes, comments, images, unread] = await Promise.all([
    db.select().from(featureRequests).orderBy(desc(featureRequests.createdAt)),
    db.select({ id: featureVotes.featureId, n: count() }).from(featureVotes).groupBy(featureVotes.featureId),
    db.select({ id: featureVotes.featureId }).from(featureVotes).where(eq(featureVotes.userId, me.id)),
    db.select({ id: featureComments.featureId, n: count() }).from(featureComments).groupBy(featureComments.featureId),
    db
      .select({ id: featureAttachments.featureId, n: count() })
      .from(featureAttachments)
      .groupBy(featureAttachments.featureId),
    unreadByJob(me.id).then((u) => u.features),
  ]);
  const voteCount = new Map(votes.map((v) => [v.id, v.n]));
  const voted = new Set(myVotes.map((v) => v.id));
  const commentCount = new Map(comments.map((c) => [c.id, c.n]));
  const imageCount = new Map(images.map((c) => [c.id, c.n]));

  // Namen der Ersteller nur für Admins laden
  const creatorIds = [...new Set(features.map((f) => f.createdBy).filter((x): x is string => !!x))];
  const names = new Map(
    isAdmin && creatorIds.length
      ? (await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, creatorIds))).map((u) => [
          u.id,
          u.name,
        ])
      : [],
  );

  const perStatus = new Map(all.map((s) => [s, features.filter((f) => f.status === s).length]));
  // Meiste Stimmen oben, bei Gleichstand der neuere Vorschlag zuerst (Liste ist schon nach Datum sortiert)
  const list = features
    .filter((f) => active.includes(f.status))
    .sort((a, b) => (voteCount.get(b.id) ?? 0) - (voteCount.get(a.id) ?? 0));

  return (
    <>
      <PageHeader title="Featureboard">
        <StatusFilter active={active} counts={perStatus} />
      </PageHeader>

      <div className="space-y-5 px-4 pb-10 sm:px-6 md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted">
            Was sollen wir als Nächstes einbauen? Reiche deine Idee ein und vote für die Ideen anderer Nutzer. So sehen
            wir, was euch am wichtigsten ist.
          </p>
          <NewFeatureForm />
        </div>

        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
            {features.length === 0
              ? "Noch keine Vorschläge. Über „+ Feature vorschlagen“ reichst du den ersten ein."
              : "Keine Vorschläge mit diesem Status."}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="Vorschläge">
            {list.map((f) => {
              const mine = f.createdBy === me.id;
              const isNew = !!unread.get(f.id);
              const nComments = commentCount.get(f.id) ?? 0;
              const nImages = imageCount.get(f.id) ?? 0;
              return (
                <li
                  key={f.id}
                  className="flex items-center gap-3 bg-surface px-3 py-3 sm:gap-4 sm:px-4"
                  data-testid="feature-row"
                >
                  <VoteButton featureId={f.id} count={voteCount.get(f.id) ?? 0} voted={voted.has(f.id)} />
                  <Link
                    href={href(`f=${f.id}`)}
                    scroll={false}
                    className={`group flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-md ${
                      openId === f.id ? "text-accent" : ""
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium leading-snug group-hover:underline">
                        <span className="min-w-0 break-words">{f.title}</span>
                        {isNew && (
                          <span
                            className="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white no-underline"
                            style={{ background: "var(--rec)" }}
                            title="Neue Einträge in der Inbox"
                          >
                            Neu
                          </span>
                        )}
                      </p>
                      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                        {mine ? (
                          <span>Von dir</span>
                        ) : (
                          isAdmin && (
                            <span>Von {f.createdBy ? (names.get(f.createdBy) ?? "–") : "gelöschtem Nutzer"}</span>
                          )
                        )}
                        <span>Erstellt {fmtDay(f.createdAt)}</span>
                        {f.completedAt && <span>Abgeschlossen {fmtDay(f.completedAt)}</span>}
                        {nComments > 0 && <span title="Kommentare">💬 {nComments}</span>}
                        {nImages > 0 && <span title="Screenshots">🖼 {nImages}</span>}
                      </p>
                    </div>
                    <FeatureBadge status={f.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {openId && <FeatureDrawer featureId={openId} closeHref={href()} me={me} imageError={params.bild === "fehler"} />}
    </>
  );
}

// Filter-Chips wie beim Board: Klick zeigt nur diesen Status, weitere dazu- bzw. wegschalten
function StatusFilter({ active, counts }: { active: string[]; counts: Map<string, number> }) {
  const all = FEATURE_STATUSES as readonly string[];
  const allOn = active.length === all.length;
  const nextFor = (value: string) => {
    const isOn = active.includes(value);
    let next = allOn ? [value] : isOn ? active.filter((s) => s !== value) : [...active, value];
    if (next.length === 0 || next.length === all.length) next = [];
    return all.filter((s) => next.includes(s)).join(",");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status filtern">
      {FEATURE_STATUSES.map((s) => {
        const on = active.includes(s) && !allOn;
        const color = FEATURE_STATUS_COLORS[s];
        return (
          <FilterButton
            key={s}
            view="featureboard"
            patch={{ s: nextFor(s) }}
            aria-pressed={active.includes(s)}
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
            {FEATURE_STATUS_LABELS[s]}
            <span className="text-xs text-muted">{counts.get(s) ?? 0}</span>
          </FilterButton>
        );
      })}
      {!allOn && (
        <FilterButton view="featureboard" patch={{ s: "" }} className="px-2 text-xs text-muted hover:text-text">
          Alle
        </FilterButton>
      )}
    </div>
  );
}
