import Link from "next/link";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { customers, ideaAttachments, ideaComments, ideaVotes, projectIdeas, user } from "@/db/schema";
import { canSeeIdea } from "@/lib/access";
import { IDEA_STATUS_COLORS, IDEA_STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/ideas";
import { Person, formatDateTime } from "@/app/components/ui";
import { AddScreenshots } from "@/app/components/screenshots";
import {
  DeleteIdeaButton,
  DeleteIdeaImageButton,
  IdeaComment,
  IdeaCommentForm,
  IdeaPriorityPicker,
  IdeaStatusPicker,
  IdeaVoteButton,
  MarkIdeaRead,
  type IdeaCommentView,
} from "./idea-forms";

export const fmtDay = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Berlin" });

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export function IdeaStatusBadge({ status }: { status: string }) {
  return <Badge color={IDEA_STATUS_COLORS[status] ?? "var(--muted)"}>{IDEA_STATUS_LABELS[status] ?? status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge color={PRIORITY_COLORS[priority] ?? "var(--muted)"}>
      <span className="sr-only">Priorität: </span>
      {PRIORITY_LABELS[priority] ?? priority}
    </Badge>
  );
}

const ROLE_LABELS: Record<string, string> = { kunde: "Client", cutter: "Cutter", admin: "Admin" };

type Me = { id: string; name: string; role: string; customerId?: string | null };

// Geöffnete Idee (Seitenpanel rechts, wie beim Featureboard)
export async function IdeaDrawer({
  ideaId,
  closeHref,
  me,
  imageError,
}: {
  ideaId: string;
  closeHref: string;
  me: Me;
  imageError?: boolean;
}) {
  const [idea] = await db.select().from(projectIdeas).where(eq(projectIdeas.id, ideaId));
  if (!idea || !(await canSeeIdea(me, idea.customerId))) {
    return (
      <Frame closeHref={closeHref} color="var(--muted)">
        <div className="space-y-3 px-4 py-6 sm:px-6">
          <p className="text-sm text-muted">Diese Idee existiert nicht mehr.</p>
          <Link href={closeHref} scroll={false} className="text-sm text-accent hover:underline">
            Zurück zur Übersicht
          </Link>
        </div>
      </Frame>
    );
  }

  const isAdmin = me.role === "admin";
  const isStaff = me.role !== "kunde";
  const canManage = isAdmin || me.customerId === idea.customerId || me.id === idea.createdBy;

  const [[{ n: votes }], myVote, images, comments] = await Promise.all([
    db.select({ n: count() }).from(ideaVotes).where(eq(ideaVotes.ideaId, idea.id)),
    db
      .select({ id: ideaVotes.ideaId })
      .from(ideaVotes)
      .where(and(eq(ideaVotes.ideaId, idea.id), eq(ideaVotes.userId, me.id))),
    db
      .select({ id: ideaAttachments.id, size: ideaAttachments.size })
      .from(ideaAttachments)
      .where(eq(ideaAttachments.ideaId, idea.id))
      .orderBy(asc(ideaAttachments.createdAt)),
    db.select().from(ideaComments).where(eq(ideaComments.ideaId, idea.id)).orderBy(asc(ideaComments.createdAt)),
  ]);

  const ids = [
    ...new Set([idea.createdBy, idea.doneBy, ...comments.map((c) => c.authorId)].filter(Boolean)),
  ] as string[];
  const people = new Map(
    (ids.length
      ? await db.select({ id: user.id, name: user.name, role: user.role }).from(user).where(inArray(user.id, ids))
      : []
    ).map((u) => [u.id, u]),
  );
  const nameOf = (id: string | null) =>
    id === me.id ? "dir" : id ? (people.get(id)?.name ?? "Gelöschter Nutzer") : "–";

  const commentViews: IdeaCommentView[] = comments.map((c) => {
    const p = c.authorId ? people.get(c.authorId) : undefined;
    return {
      id: c.id,
      body: c.body,
      author: c.authorId === me.id ? "Du" : (p?.name ?? "Gelöschter Nutzer"),
      role: p?.role ? (ROLE_LABELS[p.role] ?? p.role) : null,
      createdAt: formatDateTime(c.createdAt),
      editedAt: c.editedAt ? formatDateTime(c.editedAt) : null,
      canEdit: c.authorId === me.id,
      canDelete: c.authorId === me.id || isAdmin,
    };
  });
  const [customer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.id, idea.customerId));

  return (
    <Frame closeHref={closeHref} color={IDEA_STATUS_COLORS[idea.status] ?? "var(--muted)"}>
      <MarkIdeaRead ideaId={idea.id} />
      <div className="flex items-start gap-4 border-b border-line px-4 py-5 sm:px-6">
        <IdeaVoteButton ideaId={idea.id} count={votes} voted={myVote.length > 0} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="break-words text-xl font-semibold tracking-tight">{idea.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {isStaff ? (
              <IdeaStatusPicker key={idea.status} ideaId={idea.id} status={idea.status} />
            ) : (
              <IdeaStatusBadge status={idea.status} />
            )}
            <IdeaPriorityPicker key={idea.priority} ideaId={idea.id} priority={idea.priority} />
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
          {isStaff && (
            <>
              <dt className="text-muted">Kunde</dt>
              <dd>{customer ? <Person name={customer.name} id={customer.id} /> : "–"}</dd>
            </>
          )}
          <dt className="text-muted">Von</dt>
          <dd>{nameOf(idea.createdBy)}</dd>
          <dt className="text-muted">Erstellt</dt>
          <dd>{fmtDay(idea.createdAt)}</dd>
          <dt className="text-muted">Abgeschlossen</dt>
          <dd>
            {idea.doneAt ? (
              <>
                {fmtDay(idea.doneAt)}
                {idea.doneBy && <span className="text-muted"> · von {nameOf(idea.doneBy)}</span>}
              </>
            ) : (
              <span className="text-muted">–</span>
            )}
          </dd>
        </dl>

        {idea.note && <p className="whitespace-pre-wrap text-sm">{idea.note}</p>}

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Screenshots</h3>
          {imageError && (
            <p className="text-sm text-danger">
              Die Idee ist gespeichert, aber ein Screenshot konnte nicht hochgeladen werden. Füge ihn hier erneut hinzu.
            </p>
          )}
          {images.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {images.map((img) => (
                <li key={img.id} className="relative">
                  <a
                    href={`/api/ideas/image/${img.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="In voller Größe öffnen"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Bilder aus der eigenen API */}
                    <img
                      src={`/api/ideas/image/${img.id}`}
                      alt="Screenshot"
                      className="h-24 w-32 rounded-md border border-line bg-raised object-cover"
                    />
                  </a>
                  {canManage && <DeleteIdeaImageButton imageId={img.id} />}
                </li>
              ))}
            </ul>
          )}
          <AddScreenshots
            uploadUrl={`/api/ideas/${idea.id}/images`}
            used={images.reduce((sum, i) => sum + i.size, 0)}
            unit="Idee"
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">
            Kommentare {commentViews.length > 0 && <span className="text-muted">{commentViews.length}</span>}
          </h3>
          {commentViews.length > 0 ? (
            <ul className="space-y-2">
              {commentViews.map((c) => (
                <IdeaComment key={`${c.id}-${c.editedAt ?? ""}`} c={c} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Noch keine Kommentare.</p>
          )}
          <IdeaCommentForm ideaId={idea.id} />
        </section>

        {canManage && (
          <div className="border-t border-line pt-4">
            <DeleteIdeaButton ideaId={idea.id} title={idea.title} closeHref={closeHref} />
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
        aria-label="Idee"
      >
        <div className="h-1 w-full shrink-0" style={{ background: color }} />
        {children}
      </aside>
    </div>
  );
}
