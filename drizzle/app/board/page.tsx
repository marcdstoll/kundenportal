import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadJobs } from "@/lib/queries";
import { isConnected } from "@/lib/frameio";
import { BOARD_COLUMNS } from "@/lib/status";
import { PageHeader } from "@/app/components/shell";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { Kanban } from "@/app/components/kanban";
import { JobDrawer } from "@/app/components/job-drawer";

export default function BoardPage({ searchParams }: PageProps<"/board">) {
  return (
    <Board searchParams={searchParams} />
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
    <>
      <AutoRefresh seconds={10} />
      <PageHeader title="Board" />

      {/* Nur falls Frame.io (noch) nicht verbunden ist – sonst unsichtbar */}
      {me.role === "admin" && !(await isConnected()) && (
        <div
          className="mx-6 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm md:mx-10"
          style={{ borderColor: "var(--st-ready_to_post)", background: "color-mix(in oklab, var(--st-ready_to_post) 10%, transparent)" }}
        >
          <span>Frame.io ist nicht verbunden – Uploads funktionieren erst danach.</span>
          <a href="/api/frameio/connect" className="font-medium text-accent hover:underline">
            Jetzt verbinden
          </a>
        </div>
      )}

      <div className="space-y-8 px-6 pb-10 md:px-10">
        <Group title="Projekte (Shortform & Longform)" count={main.length}>
          <Kanban jobs={main} meId={me.id} hrefFor={(id) => `/board?job=${id}`} />
        </Group>
        <Group title="Projekte (Clipping)" count={clipping.length}>
          <Kanban jobs={clipping} meId={me.id} hrefFor={(id) => `/board?job=${id}`} />
        </Group>
      </div>

      {openJob && <JobDrawer jobId={openJob} closeHref="/board" me={me} />}
    </>
  );
}
