import Link from "next/link";
import { loadJob, listUsers, type JobView } from "@/lib/queries";
import { CUSTOMER_VIDEO_STATUSES, statusColor } from "@/lib/status";
import { ExternalLink, FormatTag, Person, StatusBadge, formatDate, formatSize, shortLink } from "./ui";
import { JobControls } from "./job-controls";
import { VideoBlock } from "./video-block";
import { DownloadAll } from "./download-all";
import { PublishDateField } from "./publish-date-field";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-start gap-3 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
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
function DrawerFrame({ job, closeHref, children }: { job: JobView; closeHref: string; children: React.ReactNode }) {
  const color = statusColor(job.status);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link href={closeHref} scroll={false} aria-label="Schließen" className="absolute inset-0 bg-black/45" />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-surface shadow-2xl">
        <div className="h-1 w-full shrink-0" style={{ background: color }} />
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0 space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">{job.title}</h2>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={job.status} />
              <FormatTag format={job.format} />
            </div>
          </div>
          <Link href={closeHref} scroll={false} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-raised hover:text-text">
            Schließen
          </Link>
        </div>
        <div className="space-y-6 px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}

function Briefing({ job }: { job: JobView }) {
  return (
    <Section title="Briefing">
      <div className="rounded-lg border border-line bg-canvas/40 px-3 py-1.5 text-sm">
        <Row label="Plattform">{job.platform}</Row>
        <Row label="Videolänge">{job.videoLength}</Row>
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

function latestVideo(job: JobView) {
  return job.files.filter((f) => f.kind === "fertig").at(-1) ?? null;
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
  const [job, staff] = await Promise.all([loadJob(jobId), listUsers("cutter", "admin")]);
  if (!job) return null;

  const isAdmin = me.role === "admin";
  const isAssigned = job.cutters.some((c) => c.id === me.id);
  const rawFiles = job.files.filter((f) => f.kind === "roh");
  const video = latestVideo(job);
  const versions = job.files.filter((f) => f.kind === "fertig").length;

  return (
    <DrawerFrame job={job} closeHref={closeHref}>
      <section>
        <Row label="Client">
          <Person name={job.customerName} />
        </Row>
        <Row label="Cutter">
          {job.cutters.length === 0 ? (
            <span className="text-muted">Noch niemand</span>
          ) : (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {job.cutters.map((c) => (
                <Person key={c.id} name={c.name} />
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
          <span className={job.billed ? "text-[var(--st-online)]" : "text-muted"}>{job.billed ? "Ja" : "Nein"}</span>
        </Row>
      </section>

      {video && (
        <Section title={versions > 1 ? `Video (Version ${versions})` : "Video"}>
          <VideoBlock fileId={video.id} name={video.name} />
        </Section>
      )}

      <Briefing job={job} />

      {rawFiles.length > 0 && (
        <Section title="Rohmaterial" action={rawFiles.length > 1 ? <DownloadAll fileIds={rawFiles.map((f) => f.id)} /> : undefined}>
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {rawFiles.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted">{formatSize(f.size)}</span>
                <a href={`/api/files/${f.id}?mode=download`} className="shrink-0 text-xs text-accent hover:underline">
                  Laden
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {isAdmin && CUSTOMER_VIDEO_STATUSES.includes(job.status) && (
        <Section title="Veröffentlichungsdatum">
          <PublishDateField jobId={job.id} value={job.publishDate} />
        </Section>
      )}

      <JobControls
        key={`${job.id}-${job.status}-${job.format}-${job.billed}-${job.cutters.length}`}
        job={{
          id: job.id,
          status: job.status,
          format: job.format,
          billed: job.billed,
          reviewUrl: job.reviewUrl,
          cutterIds: job.cutters.map((c) => c.id),
          hasVideo: versions > 0,
        }}
        isAdmin={isAdmin}
        isAssigned={isAssigned}
        staff={staff.map((s) => ({ id: s.id, name: s.name }))}
      />
    </DrawerFrame>
  );
}

// ---------- Ansicht für Kunden ----------

export async function CustomerJobDrawer({ jobId, closeHref, customerId }: { jobId: string; closeHref: string; customerId: string }) {
  const job = await loadJob(jobId);
  if (!job || job.customerId !== customerId) return null;

  const video = CUSTOMER_VIDEO_STATUSES.includes(job.status) ? latestVideo(job) : null;
  const rawFiles = job.files.filter((f) => f.kind === "roh");

  return (
    <DrawerFrame job={job} closeHref={closeHref}>
      {video ? (
        <Section title="Dein Video">
          <VideoBlock fileId={video.id} name={video.name} />
        </Section>
      ) : (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
          Sobald dein Video fertig und freigegeben ist, kannst du es hier ansehen und herunterladen.
        </p>
      )}

      {CUSTOMER_VIDEO_STATUSES.includes(job.status) && (
        <Section title="Wann wird es veröffentlicht?">
          <PublishDateField jobId={job.id} value={job.publishDate} />
          <p className="text-xs text-muted">Das Datum erscheint im Kalender, damit das Team Bescheid weiß.</p>
        </Section>
      )}

      <Briefing job={job} />

      {rawFiles.length > 0 && (
        <Section title="Hochgeladene Dateien">
          <ul className="space-y-1 text-sm">
            {rawFiles.map((f) => (
              <li key={f.id} className="flex justify-between gap-3">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted">{formatSize(f.size)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </DrawerFrame>
  );
}
