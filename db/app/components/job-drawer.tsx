import Link from "next/link";
import {
  clientLogos,
  loadComments,
  mentionCandidates,
  loadJob,
  listUsers,
  nextPartTitle,
  unreadByJob,
  type JobFileView,
  type JobView,
} from "@/lib/queries";
import { CUSTOMER_DATE_STATUSES, CUSTOMER_VIDEO_STATUSES, statusColor } from "@/lib/status";
import { canSeeJob } from "@/lib/access";
import { ExternalLink, FormatTag, Person, StatusBadge, formatDate, formatDateTime, formatSize, shortLink } from "./ui";
import { JobControls } from "./job-controls";
import { VideoBlock } from "./video-block";
import { DownloadAll } from "./download-all";
import { PublishDateField } from "./publish-date-field";
import { PublicationsForm, type PublicationView } from "./publications-form";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { publications } from "@/db/schema";
import type { PublicationPlatform } from "@/lib/publications";
import { InlinePicker } from "./inline-picker";
import {
  AddFiles,
  CancelDecision,
  CancelRequestForm,
  CommentForm,
  JobComment,
  DeleteFileButton,
  DeleteJobButton,
  DuplicateForm,
  MarkRead,
  NewMarker,
  ClientDecision,
} from "./project-actions";

// Status, in denen Kunden noch löschen dürfen bzw. eine Stornierung anfragen können
const DELETABLE = ["entwurf", "todo"];
const CANCELLABLE = ["warteschlange", "in_arbeit", "feedback", "feedback_client"];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-start gap-3 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// Seitenpanel mit Overlay; schließt per Klick daneben
function DrawerFrame({
  job,
  closeHref,
  editable = false,
  children,
}: {
  job: JobView;
  closeHref: string;
  editable?: boolean;
  children: React.ReactNode;
}) {
  const color = statusColor(job.status);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <MarkRead jobId={job.id} />
      <Link href={closeHref} scroll={false} aria-label="Schließen" className="absolute inset-0 bg-black/45" />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-surface shadow-2xl">
        <div className="h-1 w-full shrink-0" style={{ background: color }} />
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-5 sm:px-6">
          <div className="min-w-0 space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">{job.title}</h2>
            <div className="flex flex-wrap items-center gap-3">
              {editable ? (
                <>
                  <InlinePicker key={`s-${job.status}`} jobId={job.id} kind="status" value={job.status} />
                  <InlinePicker key={`f-${job.format}`} jobId={job.id} kind="format" value={job.format} />
                </>
              ) : (
                <>
                  <StatusBadge status={job.status} />
                  <FormatTag format={job.format} />
                </>
              )}
            </div>
          </div>
          <Link
            href={closeHref}
            scroll={false}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-raised hover:text-text"
          >
            Schließen
          </Link>
        </div>
        <div className="space-y-6 px-4 py-5 sm:px-6">{children}</div>
      </aside>
    </div>
  );
}

function Briefing({ job }: { job: JobView }) {
  return (
    <Section title="Briefing">
      <div className="rounded-lg border border-line bg-canvas/40 px-3 py-1.5 text-sm">
        <Row label="Plattformen">{job.platform}</Row>
        {job.videoLength && <Row label="Videolänge">{job.videoLength}</Row>}
        <Row label="Inhalt">
          <p className="whitespace-pre-wrap">{job.content}</p>
        </Row>
        <Row label="Besonderheiten">
          <p className="whitespace-pre-wrap">{job.specialNotes}</p>
        </Row>
      </div>
    </Section>
  );
}

// Hinweis, solange eine Stornierung angefragt ist – die Arbeit ruht
function CancelBanner({ job, isAdmin }: { job: JobView; isAdmin: boolean }) {
  if (!job.cancelRequestedAt) return null;
  return (
    <div className="space-y-2 rounded-lg border border-danger/50 bg-danger/5 p-3 text-sm">
      <p className="font-medium text-danger">⏸ Stornierung angefragt – Arbeit bitte pausieren</p>
      <p className="text-muted">
        Angefragt am {formatDateTime(job.cancelRequestedAt)}
        {job.cancelReason ? ` · Grund: „${job.cancelReason}“` : ""}
      </p>
      {isAdmin ? <CancelDecision jobId={job.id} /> : <p className="text-muted">Ein Admin entscheidet in Kürze.</p>}
    </div>
  );
}

// Dateiübersicht: Name, Größe, Upload-Datum, wer, "Neu"-Markierung, ggf. Löschen
function FileList({
  files,
  unread,
  canDownload,
  canDelete,
}: {
  files: JobFileView[];
  unread: Set<string>;
  canDownload: boolean;
  canDelete: boolean;
}) {
  if (files.length === 0) return <p className="text-sm text-muted">Noch keine Dateien.</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line text-sm">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate">{f.name}</span>
              <NewMarker show={unread.has(f.id)} />
            </div>
            <p className="text-xs text-muted">
              {formatDateTime(f.createdAt)}
              {f.uploaderName ? ` · ${f.uploaderName}` : ""}
              {f.late ? " · nachgereicht" : ""}
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted">{formatSize(f.size)}</span>
          {canDownload && (
            <a href={`/api/files/${f.id}?mode=download`} className="shrink-0 text-xs text-accent hover:underline">
              Laden
            </a>
          )}
          {canDelete && <DeleteFileButton fileId={f.id} name={f.name} />}
        </li>
      ))}
    </ul>
  );
}

const ROLE_LABELS: Record<string, string> = { kunde: "Client", cutter: "Cutter", admin: "Admin" };

// Kommentarverlauf + Eingabe. Eigene Kommentare bearbeiten/löschen, Admins dürfen alle löschen.
// Mit @ lassen sich Beteiligte erwähnen – sie bekommen dann direkt eine Meldung in der Inbox.
async function Comments({
  job,
  viewer,
  canWrite,
}: {
  job: JobView;
  viewer: { id: string; role: string };
  canWrite: boolean;
}) {
  const [comments, candidates] = await Promise.all([loadComments(job.id), mentionCandidates(job, viewer)]);
  const isAdmin = viewer.role === "admin";
  const isKunde = viewer.role === "kunde";
  // Kunden sehen das Team als „Team“, alle anderen die Rolle
  const people = candidates.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role === "admin" ? (isKunde ? "Team" : "Admin") : (ROLE_LABELS[p.role] ?? p.role),
  }));
  return (
    <Section title={`Kommentare${comments.length ? ` (${comments.length})` : ""}`}>
      {comments.length === 0 && <p className="text-sm text-muted">Noch keine Kommentare.</p>}
      <ul className="space-y-3">
        {comments.map((c) => {
          const mine = !!c.authorId && c.authorId === viewer.id;
          return (
            <JobComment
              key={`${c.id}-${c.editedAt?.getTime() ?? 0}`}
              meId={viewer.id}
              people={people}
              showEmail={!isKunde}
              comment={{
                id: c.id,
                body: c.body,
                author: mine ? "Du" : (c.authorName ?? "Gelöschter Nutzer"),
                avatarName: c.authorName ?? "?",
                avatarId: c.authorId,
                role: c.authorRole ? (ROLE_LABELS[c.authorRole] ?? c.authorRole) : null,
                createdAt: formatDateTime(c.createdAt),
                editedAt: c.editedAt ? formatDateTime(c.editedAt) : null,
                canEdit: mine,
                canDelete: mine || isAdmin,
              }}
            />
          );
        })}
      </ul>
      {canWrite && <CommentForm jobId={job.id} people={people} showEmail={!isKunde} />}
    </Section>
  );
}

function latestVideo(job: JobView) {
  return job.files.filter((f) => f.kind === "fertig").at(-1) ?? null;
}

// Link-Vorlage, um nach dem Duplizieren direkt das neue Projekt zu öffnen
function jobHrefTemplate(closeHref: string) {
  return `${closeHref}${closeHref.includes("?") ? "&" : "?"}job=JOBID`;
}

// ---------- Ansicht für Cutter und Admins ----------

export async function JobDrawer({
  jobId,
  closeHref,
  me,
}: {
  jobId: string;
  closeHref: string;
  me: { id: string; role: string };
}) {
  const [job, staff, unread, logos] = await Promise.all([
    loadJob(jobId),
    listUsers("cutter", "admin"),
    unreadByJob(me.id),
    clientLogos(),
  ]);
  if (!job || !(await canSeeJob(me, job))) return null;

  const isAdmin = me.role === "admin";
  const isAssigned = job.cutters.some((c) => c.id === me.id);
  const rawFiles = job.files.filter((f) => f.kind === "roh");
  const video = latestVideo(job);
  const versions = job.files.filter((f) => f.kind === "fertig").length;
  const paused = !!job.cancelRequestedAt;
  const suggestion = job.status !== "entwurf" ? await nextPartTitle(job) : "";
  const pubs: PublicationView[] = isAdmin
    ? (await db.select().from(publications).where(eq(publications.jobId, job.id))).map((p) => ({
        platform: p.platform as PublicationPlatform,
        url: p.url,
        views: p.views,
        viewsAt: p.viewsAt?.toISOString() ?? null,
        lastError: p.lastError,
      }))
    : [];

  return (
    <DrawerFrame job={job} closeHref={closeHref} editable={isAdmin}>
      <CancelBanner job={job} isAdmin={isAdmin} />

      <section>
        <Row label="Client">
          {/* Klick öffnet die Detailansicht des Kunden (Links, Infos für die Cutter) */}
          <Link
            href={`/kundenprofil/${job.customerId}`}
            className="rounded-md hover:underline"
            title="Kundenprofil öffnen"
            data-testid="client-link"
          >
            <Person name={job.customerName} id={job.customerId} logoUrl={logos.get(job.customerId)} />
          </Link>
        </Row>
        <Row label="Cutter">
          {job.cutters.length === 0 ? (
            <span className="text-muted">Noch niemand</span>
          ) : (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {job.cutters.map((c) => (
                <Person key={c.id} name={c.name} id={c.id} />
              ))}
            </div>
          )}
        </Row>
        <Row label="Footage">
          {job.frameioFolderUrl ? (
            <ExternalLink href={job.frameioFolderUrl}>{shortLink(job.frameioFolderUrl)}</ExternalLink>
          ) : (
            <span className="text-muted">–</span>
          )}
        </Row>
        <Row label="Review-Link">
          {job.reviewUrl ? (
            <ExternalLink href={job.reviewUrl}>{shortLink(job.reviewUrl)}</ExternalLink>
          ) : (
            <span className="text-muted">Noch keiner</span>
          )}
        </Row>
        <Row label="Veröffentlichung">
          {job.publishDate ? formatDate(job.publishDate) : <span className="text-muted">Noch offen</span>}
        </Row>
        <Row label="Abgerechnet">
          <span className="flex flex-wrap gap-x-4">
            <span className={job.billedCustomer ? "text-[var(--st-online)]" : "text-muted"}>
              Kunde: {job.billedCustomer ? "Ja" : "Nein"}
            </span>
            <span className={job.billed ? "text-[var(--st-online)]" : "text-muted"}>
              Cutter: {job.billed ? "Ja" : "Nein"}
            </span>
          </span>
        </Row>
      </section>

      {video && (
        <Section title={versions > 1 ? `Video (Version ${versions})` : "Video"}>
          <VideoBlock fileId={video.id} name={video.name} />
        </Section>
      )}

      <Briefing job={job} />

      <Section
        title={
          <span className="flex items-center gap-2">
            Rohmaterial <NewMarker show={rawFiles.some((f) => unread.files.has(f.id))} />
          </span>
        }
        action={rawFiles.length > 1 ? <DownloadAll fileIds={rawFiles.map((f) => f.id)} /> : undefined}
      >
        <FileList
          files={rawFiles}
          unread={unread.files}
          canDownload
          canDelete={isAdmin && DELETABLE.includes(job.status)}
        />
        {job.status !== "storniert" && <AddFiles jobId={job.id} title={job.title} />}
      </Section>

      <Comments job={job} viewer={me} canWrite={job.status !== "storniert"} />

      {isAdmin && (
        <Section title="Veröffentlichungsdatum">
          <PublishDateField jobId={job.id} value={job.publishDate} />
        </Section>
      )}

      {isAdmin && job.status !== "storniert" && (
        <Section title="Veröffentlichungen">
          <p className="text-xs text-muted">
            Links zum fertigen Post – daraus holt die Hall of Fame täglich die Views.
          </p>
          <PublicationsForm key={pubs.map((p) => `${p.url}|${p.views}`).join(",")} jobId={job.id} publications={pubs} />
        </Section>
      )}

      {job.status !== "entwurf" && (
        <Section title="Weiteren Teil anlegen">
          <DuplicateForm key={suggestion} jobId={job.id} suggestion={suggestion} hrefFor={jobHrefTemplate(closeHref)} />
        </Section>
      )}

      <JobControls
        key={`${job.id}-${job.status}-${job.format}-${job.billed}-${job.billedCustomer}-${job.cutters.length}-${paused}`}
        job={{
          id: job.id,
          status: job.status,
          format: job.format,
          billed: job.billed,
          billedCustomer: job.billedCustomer,
          reviewUrl: job.reviewUrl,
          cutterIds: job.cutters.map((c) => c.id),
          hasVideo: versions > 0,
          paused,
        }}
        isAdmin={isAdmin}
        isAssigned={isAssigned}
        staff={staff.map((s) => ({ id: s.id, name: s.name }))}
        beforeBilling={
          isAdmin && DELETABLE.includes(job.status) ? (
            <DeleteJobButton jobId={job.id} title={job.title} afterHref={closeHref} />
          ) : null
        }
      />
    </DrawerFrame>
  );
}

// ---------- Ansicht für Kunden (und Admins in der Kundenansicht) ----------

export async function CustomerJobDrawer({
  jobId,
  closeHref,
  customerId,
  viewerId,
  viewerRole,
}: {
  jobId: string;
  closeHref: string;
  customerId: string;
  viewerId: string;
  viewerRole: string; // "kunde" oder "admin" (Kundenansicht)
}) {
  const [job, unread] = await Promise.all([loadJob(jobId), unreadByJob(viewerId)]);
  if (!job || job.customerId !== customerId) return null;

  const video = CUSTOMER_VIDEO_STATUSES.includes(job.status) ? latestVideo(job) : null;
  const rawFiles = job.files.filter((f) => f.kind === "roh");
  const canDelete = DELETABLE.includes(job.status);
  const canRequestCancel = CANCELLABLE.includes(job.status) && !job.cancelRequestedAt;

  return (
    <DrawerFrame job={job} closeHref={closeHref}>
      {job.cancelRequestedAt && (
        <div className="rounded-lg border border-danger/50 bg-danger/5 p-3 text-sm">
          <p className="font-medium text-danger">Stornierung angefragt</p>
          <p className="text-muted">Die Arbeit ist pausiert. Unser Team meldet sich mit einer Entscheidung.</p>
        </div>
      )}

      {video ? (
        <Section title="Dein Video">
          <VideoBlock fileId={video.id} name={video.name} />
        </Section>
      ) : (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
          {job.status === "storniert"
            ? "Dieses Projekt wurde storniert."
            : "Sobald dein Video fertig und freigegeben ist, kannst du es hier ansehen und herunterladen."}
        </p>
      )}

      {/* Kunden-Feedback: Review-Link + Entscheidung (danach wird der Link nicht mehr gezeigt) */}
      {job.status === "feedback_client" && (
        <Section title="Deine Abnahme">
          <p className="text-sm text-muted">Schau dir das Video an und entscheide: freigeben oder zurückschicken.</p>
          {job.reviewUrl && (
            <a
              href={job.reviewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-sm text-accent hover:underline"
            >
              Video im Review ansehen und kommentieren ↗
            </a>
          )}
          <ClientDecision jobId={job.id} />
        </Section>
      )}
      {CUSTOMER_DATE_STATUSES.includes(job.status) && (
        <Section title="Wann wird es veröffentlicht?">
          <PublishDateField jobId={job.id} value={job.publishDate} />
        </Section>
      )}

      <Briefing job={job} />

      <Section title="Deine Dateien">
        <FileList files={rawFiles} unread={unread.files} canDownload canDelete={canDelete} />
        {job.status !== "storniert" && (
          <AddFiles jobId={job.id} title={job.title} label="Weiteres Material hochladen" />
        )}
      </Section>

      <Comments job={job} viewer={{ id: viewerId, role: viewerRole }} canWrite={job.status !== "storniert"} />

      {canDelete && (
        <Section title="Projekt löschen">
          <DeleteJobButton jobId={job.id} title={job.title} afterHref={closeHref} />
        </Section>
      )}
      {canRequestCancel && <CancelRequestForm jobId={job.id} />}
    </DrawerFrame>
  );
}
