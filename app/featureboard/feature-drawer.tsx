import Link from "next/link";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { featureAttachments, featureComments, featureRequests, featureVotes, user } from "@/db/schema";
import { FEATURE_STATUS_COLORS, FEATURE_STATUS_LABELS, TEAM_NAME } from "@/lib/features";
import { formatDateTime } from "@/app/components/ui";
import {
  AddScreenshots,
  CommentForm,
  DeleteFeatureButton,
  DeleteImageButton,
  FeatureComment,
  FeatureStatusPicker,
  MarkFeatureRead,
  VoteButton,
  type CommentView,
} from "./feature-forms";

export const fmtDay = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Berlin" });

export function FeatureBadge({ status }: { status: string }) {
  const color = FEATURE_STATUS_COLORS[status] ?? "var(--muted)";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {FEATURE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

type Me = { id: string; name: string; role: string };

// Geöffneter Vorschlag (Seitenpanel rechts, wie beim Board)
export async function FeatureDrawer({
  featureId,
  closeHref,
  me,
  imageError,
}: {
  featureId: string;
  closeHref: string;
  me: Me;
  imageError?: boolean;
}) {
  const [f] = await db.select().from(featureRequests).where(eq(featureRequests.id, featureId));
  if (!f) {
    return (
      <Frame closeHref={closeHref} color="var(--muted)">
        <div className="space-y-3 px-4 py-6 sm:px-6">
          <p className="text-sm text-muted">Dieser Vorschlag existiert nicht mehr.</p>
          <Link href={closeHref} scroll={false} className="text-sm text-accent hover:underline">
            Zurück zur Übersicht
          </Link>
        </div>
      </Frame>
    );
  }

  const isAdmin = me.role === "admin";
  const isCreator = f.createdBy === me.id;
  const canManage = isAdmin || isCreator;

  const [[{ n: votes }], myVote, images, comments] = await Promise.all([
    db.select({ n: count() }).from(featureVotes).where(eq(featureVotes.featureId, f.id)),
    db
      .select({ id: featureVotes.featureId })
      .from(featureVotes)
      .where(and(eq(featureVotes.featureId, f.id), eq(featureVotes.userId, me.id))),
    db
      .select({ id: featureAttachments.id, size: featureAttachments.size })
      .from(featureAttachments)
      .where(eq(featureAttachments.featureId, f.id))
      .orderBy(asc(featureAttachments.createdAt)),
    db
      .select()
      .from(featureComments)
      .where(eq(featureComments.featureId, f.id))
      .orderBy(asc(featureComments.createdAt)),
  ]);

  // Namen und Rollen der Beteiligten (Namen werden nur Admins gezeigt)
  const ids = [...new Set([f.createdBy, ...comments.map((c) => c.authorId)].filter((x): x is string => !!x))];
  const people = new Map(
    ids.length
      ? (
          await db.select({ id: user.id, name: user.name, role: user.role }).from(user).where(inArray(user.id, ids))
        ).map((u) => [u.id, u])
      : [],
  );

  const authorLabel = (authorId: string | null): { author: string; team: boolean } => {
    const p = authorId ? people.get(authorId) : undefined;
    const team = p?.role === "admin";
    if (authorId === me.id) return { author: team && isAdmin ? `Du · ${TEAM_NAME}` : "Du", team };
    if (team) return { author: isAdmin ? `${p!.name} · ${TEAM_NAME}` : TEAM_NAME, team };
    if (authorId && authorId === f.createdBy)
      return { author: isAdmin ? `${p?.name ?? "–"} (Ersteller)` : "Ersteller", team };
    return { author: isAdmin && p ? p.name : "Gelöschter Nutzer", team };
  };

  const commentViews: CommentView[] = comments.map((c) => ({
    id: c.id,
    body: c.body,
    ...authorLabel(c.authorId),
    createdAt: formatDateTime(c.createdAt),
    editedAt: c.editedAt ? formatDateTime(c.editedAt) : null,
    canEdit: c.authorId === me.id,
    canDelete: c.authorId === me.id || isAdmin,
  }));

  const creatorName = f.createdBy ? people.get(f.createdBy)?.name : null;

  return (
    <Frame closeHref={closeHref} color={FEATURE_STATUS_COLORS[f.status]}>
      <MarkFeatureRead featureId={f.id} />
      <div className="flex items-start gap-4 border-b border-line px-4 py-5 sm:px-6">
        <VoteButton featureId={f.id} count={votes} voted={myVote.length > 0} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="break-words text-xl font-semibold tracking-tight">{f.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <FeatureStatusPicker key={f.status} featureId={f.id} status={f.status} />
            ) : (
              <FeatureBadge status={f.status} />
            )}
          </div>
        </div>
        <Link
          href={closeHref}
          scroll={false}
          aria-label="Schließen"
          className="-mr-2 rounded-md px-2 py-1 text-xl leading-none text-muted hover:bg-raised hover:text-text"
        >
          ×
        </Link>
      </div>

      <div className="space-y-6 px-4 py-5 sm:px-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {(isAdmin || isCreator) && (
            <>
              <dt className="text-muted">Von</dt>
              <dd>{isCreator ? "dir" : (creatorName ?? "Gelöschter Nutzer")}</dd>
            </>
          )}
          <dt className="text-muted">Erstellt</dt>
          <dd>{fmtDay(f.createdAt)}</dd>
          <dt className="text-muted">Abgeschlossen</dt>
          <dd>{f.completedAt ? fmtDay(f.completedAt) : <span className="text-muted">–</span>}</dd>
        </dl>

        {f.description && <p className="whitespace-pre-wrap text-sm">{f.description}</p>}

        {(images.length > 0 || canManage) && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Screenshots</h3>
            {imageError && (
              <p className="text-sm text-danger">
                Der Vorschlag ist gespeichert, aber ein Screenshot konnte nicht hochgeladen werden. Füge ihn hier erneut
                hinzu.
              </p>
            )}
            {images.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {images.map((img) => (
                  <li key={img.id} className="relative">
                    <a
                      href={`/api/features/image/${img.id}`}
                      target="_blank"
                      rel="noreferrer"
                      title="In voller Größe öffnen"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- Bilder aus der eigenen API */}
                      <img
                        src={`/api/features/image/${img.id}`}
                        alt="Screenshot"
                        className="h-24 w-32 rounded-md border border-line bg-raised object-cover"
                      />
                    </a>
                    {canManage && <DeleteImageButton imageId={img.id} />}
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <AddScreenshots
                uploadUrl={`/api/features/${f.id}/images`}
                used={images.reduce((sum, i) => sum + i.size, 0)}
              />
            )}
          </section>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-medium">
            Kommentare {commentViews.length > 0 && <span className="text-muted">{commentViews.length}</span>}
          </h3>
          {commentViews.length > 0 ? (
            <ul className="space-y-2">
              {commentViews.map((c) => (
                <FeatureComment key={`${c.id}-${c.editedAt ?? ""}`} c={c} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Noch keine Kommentare.</p>
          )}
          {canManage ? (
            <CommentForm featureId={f.id} />
          ) : (
            <p className="text-xs text-muted">Kommentieren können nur der Ersteller und das Team.</p>
          )}
        </section>

        {canManage && (
          <div className="border-t border-line pt-4">
            <DeleteFeatureButton featureId={f.id} title={f.title} closeHref={closeHref} />
          </div>
        )}
      </div>
    </Frame>
  );
}

function Frame({ closeHref, color, children }: { closeHref: string; color: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link href={closeHref} scroll={false} aria-label="Schließen" className="absolute inset-0 bg-black/45" />
      <aside
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-surface shadow-2xl"
        aria-label="Vorschlag"
      >
        <div className="h-1 w-full shrink-0" style={{ background: color }} />
        {children}
      </aside>
    </div>
  );
}
