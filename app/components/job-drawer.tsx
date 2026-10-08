import Link from "next/link";
import { loadJob, listUsers } from "@/lib/queries";
import { ExternalLink, FormatTag, Person, StatusBadge, formatSize, shortLink } from "./ui";
import { JobControls } from "./job-controls";

type Props = {
  jobId: string;
  closeHref: string;
  me: { id: string; role: string };
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-start gap-3 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Detailansicht eines Projekts als Seitenpanel (öffnet sich über ?job=…)
export async function JobDrawer({ jobId, closeHref, me }: Props) {
  const [job, staff] = await Promise.all([loadJob(jobId), listUsers("cutter", "admin")]);
  if (!job) return null;

  const isAdmin = me.role === "admin";
  const isAssigned = job.cutters.some((c) => c.id === me.id);
  const rawFiles = job.files.filter((f) => f.kind === "roh");
  const finalFiles = job.files.filter((f) => f.kind === "fertig");

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link href={closeHref} scroll={false} aria-label="Schließen" className="absolute inset-0 bg-black/50" />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0 space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">{job.title}</h2>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={job.status} />
              <FormatTag format={job.format} />
            </div>
          </div>
          <Link href={closeHref} scroll={false} className="rounded-md px-2 py-1 text-muted hover:bg-raised hover:text-text">
            Schließen
          </Link>
        </div>

        <div className="space-y-6 px-6 py-5">
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
            <Row label="Abgerechnet">
              <span className={job.billed ? "text-emerald-300" : "text-muted"}>
                {job.billed ? "Ja" : "Nein"}
              </span>
            </Row>
          </section>

          {job.feedbackNote && (
            <section className="rounded-lg border border-violet-400/30 bg-violet-400/10 p-3 text-sm">
              <p className="mb-1 font-medium text-violet-200">Feedback vom Admin</p>
              <p className="whitespace-pre-wrap">{job.feedbackNote}</p>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Briefing</h3>
            <div className="rounded-lg border border-line bg-canvas/40 p-3 text-sm">
              <Row label="Plattform">{job.platform}</Row>
              <Row label="Videolänge">{job.videoLength}</Row>
              <Row label="Inhalt">
                <p className="whitespace-pre-wrap">{job.content}</p>
              </Row>
              <Row label="Besonderheiten">
                <p className="whitespace-pre-wrap">{job.specialNotes}</p>
              </Row>
            </div>
          </section>

          {(rawFiles.length > 0 || finalFiles.length > 0) && (
            <section className="space-y-2 text-sm">
              <h3 className="font-medium">Dateien</h3>
              <ul className="space-y-1">
                {[...finalFiles, ...rawFiles].map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-xs text-muted">
                      {f.kind === "fertig" ? "Fertig" : "Roh"}
                    </span>
                    {f.frameioUrl ? (
                      <ExternalLink href={f.frameioUrl}>{f.name}</ExternalLink>
                    ) : (
                      <span className="truncate">{f.name}</span>
                    )}
                    <span className="ml-auto shrink-0 text-xs text-muted">
                      {formatSize(f.size)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
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
            }}
            isAdmin={isAdmin}
            isAssigned={isAssigned}
            staff={staff.map((s) => ({ id: s.id, name: s.name }))}
          />
        </div>
      </aside>
    </div>
  );
}
