import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadJobs } from "@/lib/queries";
import { BOARD_COLUMNS } from "@/lib/status";
import { Shell, PageHeader } from "@/app/components/shell";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { Kanban } from "@/app/components/kanban";
import { JobDrawer } from "@/app/components/job-drawer";

export default function BoardPage({ searchParams }: PageProps<"/board">) {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Lade…</p>}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}

// Aufklappbarer Bereich wie in Notion
function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <details open className="group">
      <summary className="mb-3 flex cursor-pointer items-center gap-2 text-lg font-semibold tracking-tight">
        <span className="inline-block text-muted transition-transform group-open:rotate-90">›</span>
        {title}
        <span className="text-sm font-normal text-muted">{count}</span>
      </summary>
      {children}
    </details>
  );
}

async function Board({ searchParams }: { searchParams: PageProps<"/board">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");

  const params = await searchParams;
  const openJob = typeof params.job === "string" ? params.job : null;

  // Online und Storniert stehen nicht auf dem Board, sondern in den Listen
  const jobs = (await loadJobs()).filter((j) => (BOARD_COLUMNS as readonly string[]).includes(j.status));
  const main = jobs.filter((j) => j.format !== "clipping");
  const clipping = jobs.filter((j) => j.format === "clipping");

  return (
    <Shell user={me}>
      <AutoRefresh seconds={10} />
      <PageHeader title="Board">
        {me.role === "admin" && (
          <>
            <a href="/api/frameio/connect" className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:bg-raised hover:text-text">
              Frame.io verbinden
            </a>
            <a href="/api/frameio/test" className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:bg-raised hover:text-text">
              Verbindung testen
            </a>
          </>
        )}
      </PageHeader>

      <div className="space-y-8 px-6 pb-10 md:px-10">
        <Group title="Projekte (Shortform & Longform)" count={main.length}>
          <Kanban jobs={main} meId={me.id} hrefFor={(id) => `/board?job=${id}`} />
        </Group>
        <Group title="Projekte (Clipping)" count={clipping.length}>
          <Kanban jobs={clipping} meId={me.id} hrefFor={(id) => `/board?job=${id}`} />
        </Group>
      </div>

      {openJob && <JobDrawer jobId={openJob} closeHref="/board" me={me} />}
    </Shell>
  );
}
