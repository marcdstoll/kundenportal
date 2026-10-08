import { Suspense } from "react";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { jobFiles, jobs, user } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { BOARD_COLUMNS, STATUS_LABELS } from "@/lib/status";
import { TopBar } from "@/app/components/top-bar";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { JobActions } from "./job-actions";

export default function BoardPage() {
  return (
    <Suspense fallback={<p className="p-8">Lade…</p>}>
      <BoardContent />
    </Suspense>
  );
}

const customer = alias(user, "customer");
const cutter = alias(user, "cutter");

async function BoardContent() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");

  // Alle abgeschickten Aufträge mit Kunden- und Cutter-Namen
  const rows = await db
    .select({
      job: jobs,
      customerName: customer.name,
      cutterName: cutter.name,
    })
    .from(jobs)
    .innerJoin(customer, eq(jobs.customerId, customer.id))
    .leftJoin(cutter, eq(jobs.cutterId, cutter.id))
    .where(ne(jobs.status, "entwurf"))
    .orderBy(desc(jobs.updatedAt));

  const ids = rows.map((r) => r.job.id);
  const files =
    ids.length > 0
      ? await db
          .select()
          .from(jobFiles)
          .where(and(inArray(jobFiles.jobId, ids), eq(jobFiles.uploaded, true)))
      : [];

  return (
    <>
      <TopBar user={me} />
      <AutoRefresh seconds={10} />
      <main className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Board</h1>
          {me.role === "admin" && (
            <div className="flex gap-2 text-sm">
              <a href="/api/frameio/connect" className="rounded border px-3 py-1">
                Frame.io verbinden
              </a>
              <a href="/api/frameio/test" className="rounded border px-3 py-1">
                Frame.io testen
              </a>
            </div>
          )}
        </div>

        <div className="grid gap-4 overflow-x-auto md:grid-cols-5">
          {BOARD_COLUMNS.map((status) => {
            const columnRows = rows.filter((r) => r.job.status === status);
            return (
              <section key={status} className="min-w-64 rounded-lg border p-3">
                <h2 className="mb-3 font-semibold">
                  {STATUS_LABELS[status]}{" "}
                  <span className="text-sm opacity-60">({columnRows.length})</span>
                </h2>
                <div className="space-y-3">
                  {columnRows.map(({ job, customerName, cutterName }) => {
                    const mine = job.cutterId === me.id;
                    const jobFilesList = files.filter((f) => f.jobId === job.id);
                    return (
                      <article
                        key={job.id}
                        className={`space-y-2 rounded border p-3 text-sm ${mine ? "border-blue-500" : ""}`}
                      >
                        <div>
                          <p className="font-medium">{job.title}</p>
                          <p className="opacity-70">
                            {customerName} · {job.platform} · {job.videoLength}
                          </p>
                          {cutterName && <p className="opacity-70">Cutter: {cutterName}</p>}
                        </div>

                        <details>
                          <summary className="cursor-pointer opacity-80">Briefing</summary>
                          <p className="mt-1 whitespace-pre-wrap">
                            <b>Inhalt:</b> {job.content}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">
                            <b>Besonderheiten:</b> {job.specialNotes}
                          </p>
                        </details>

                        <div className="space-y-1">
                          {job.frameioFolderUrl && (
                            <a href={job.frameioFolderUrl} target="_blank" rel="noreferrer" className="block underline">
                              Ordner in Frame.io öffnen
                            </a>
                          )}
                          {jobFilesList.map((f) => (
                            <a
                              key={f.id}
                              href={f.frameioUrl ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate underline opacity-80"
                            >
                              {f.kind === "fertig" ? "Fertig: " : "Roh: "}
                              {f.name}
                            </a>
                          ))}
                        </div>

                        {job.feedbackNote && job.status === "in_bearbeitung" && (
                          <p className="rounded bg-yellow-500/15 p-2">
                            <b>Feedback:</b> {job.feedbackNote}
                          </p>
                        )}

                        <JobActions
                          jobId={job.id}
                          status={job.status}
                          isMine={mine}
                          isAdmin={me.role === "admin"}
                        />
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
