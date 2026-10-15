import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { clientLogos, loadJobs, unreadByJob } from "@/lib/queries";
import { isConnected } from "@/lib/frameio";
import { jobScope } from "@/lib/access";
import { BOARD_COLUMNS, FORMATS } from "@/lib/status";
import { parseFormatFilter } from "@/lib/board-prefs";
import { FormatFilter } from "@/app/components/format-filter";
import { PageHeader } from "@/app/components/shell";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { Kanban } from "@/app/components/kanban";
import { JobDrawer } from "@/app/components/job-drawer";

export default function BoardPage({ searchParams }: PageProps<"/board">) {
  return <Board searchParams={searchParams} />;
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

  // Formatfilter (?f=shortform,longform) – ohne Angabe alle
  const formats = parseFormatFilter(params.f);
  const allFormats = formats.length === FORMATS.length;
  const query = allFormats ? "" : `f=${formats.join(",")}`;
  const href = (extra?: string) => {
    const q = [query, extra].filter(Boolean).join("&");
    return q ? `/board?${q}` : "/board";
  };

  // Online und Storniert stehen nicht auf dem Board, sondern in den Listen
  const [unread, logos] = await Promise.all([unreadByJob(me.id).then((u) => u.jobs), clientLogos()]);
  const jobs = (await loadJobs(await jobScope(me))).filter(
    (j) => (BOARD_COLUMNS as readonly string[]).includes(j.status) && formats.includes(j.format),
  );
  const main = jobs.filter((j) => j.format !== "clipping");
  const clipping = jobs.filter((j) => j.format === "clipping");
  const showMain = formats.includes("shortform") || formats.includes("longform");
  const showClipping = formats.includes("clipping");

  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHeader title="Board">
        <FormatFilter active={formats} basePath="/board" />
      </PageHeader>

      {/* Nur falls Frame.io (noch) nicht verbunden ist – sonst unsichtbar */}
      {me.role === "admin" && !(await isConnected()) && (
        <div
          className="mx-4 mb-6 flex sm:mx-6 flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm md:mx-10"
          style={{
            borderColor: "var(--st-ready_to_post)",
            background: "color-mix(in oklab, var(--st-ready_to_post) 10%, transparent)",
          }}
        >
          <span>Frame.io ist nicht verbunden – Uploads funktionieren erst danach.</span>
          <a href="/api/frameio/connect" className="font-medium text-accent hover:underline">
            Jetzt verbinden
          </a>
        </div>
      )}

      <div className="space-y-8 px-4 pb-10 sm:px-6 md:px-10">
        {showMain && (
          <Group
            title={
              formats.includes("shortform") && formats.includes("longform")
                ? "Projekte (Shortform & Longform)"
                : formats.includes("shortform")
                  ? "Projekte (Shortform)"
                  : "Projekte (Longform)"
            }
            count={main.length}
          >
            <Kanban jobs={main} meId={me.id} unread={unread} logos={logos} hrefFor={(id) => href(`job=${id}`)} />
          </Group>
        )}
        {showClipping && (
          <Group title="Projekte (Clipping)" count={clipping.length}>
            <Kanban jobs={clipping} meId={me.id} unread={unread} logos={logos} hrefFor={(id) => href(`job=${id}`)} />
          </Group>
        )}
      </div>

      {openJob && <JobDrawer jobId={openJob} closeHref={href()} me={me} />}
    </>
  );
}
