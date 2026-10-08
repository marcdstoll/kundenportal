import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { jobFiles, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { STATUS_LABELS } from "@/lib/status";
import { TopBar } from "@/app/components/top-bar";
import { AutoRefresh } from "@/app/components/auto-refresh";

export default function KundePage() {
  return (
    <Suspense fallback={<p className="p-8">Lade…</p>}>
      <KundeContent />
    </Suspense>
  );
}

async function KundeContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const myJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.customerId, user.id))
    .orderBy(desc(jobs.createdAt));

  // Fertige Videos zu abgeschlossenen Aufträgen
  const doneIds = myJobs.filter((j) => j.status === "abgeschlossen").map((j) => j.id);
  const finals =
    doneIds.length > 0
      ? await db
          .select()
          .from(jobFiles)
          .where(
            and(
              inArray(jobFiles.jobId, doneIds),
              eq(jobFiles.kind, "fertig"),
              eq(jobFiles.uploaded, true)
            )
          )
      : [];

  return (
    <>
      <TopBar user={user} />
      <AutoRefresh seconds={15} />
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Meine Aufträge</h1>
          <Link href="/kunde/neu" className="rounded bg-blue-600 px-4 py-2 text-white">
            + Neuer Auftrag
          </Link>
        </div>

        {myJobs.length === 0 && (
          <p className="opacity-70">Noch keine Aufträge. Leg deinen ersten Auftrag an.</p>
        )}

        <ul className="space-y-3">
          {myJobs.map((job) => (
            <li key={job.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{job.title}</p>
                  <p className="text-sm opacity-70">
                    {job.platform} · {job.videoLength} ·{" "}
                    {job.createdAt.toLocaleDateString("de-DE")}
                  </p>
                </div>
                <span className="rounded-full border px-3 py-1 text-sm">
                  {STATUS_LABELS[job.status] ?? job.status}
                </span>
              </div>

              {job.status === "abgeschlossen" && (
                <div className="mt-3 space-y-1 text-sm">
                  <p className="font-medium">Dein fertiges Video:</p>
                  {finals
                    .filter((f) => f.jobId === job.id)
                    .map((f) => (
                      <a
                        key={f.id}
                        href={f.frameioUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="block underline"
                      >
                        {f.name} ansehen
                      </a>
                    ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
