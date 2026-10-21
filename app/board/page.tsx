import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { clientLogos, listUsers, loadJobs, unreadByJob } from "@/lib/queries";
import { isConnected } from "@/lib/frameio";
import { clientIdsOfCutter, jobScope } from "@/lib/access";
import { ClientFilter } from "@/app/components/client-filter";
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

async function Board({ searchParams }: { searchParams: PageProps<"/board">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");

  const params = await searchParams;
  const openJob = typeof params.job === "string" ? params.job : null;

  // Online und Storniert stehen nicht auf dem Board, sondern in den Listen
  const [unread, logos] = await Promise.all([unreadByJob(me.id).then((u) => u.jobs), clientLogos()]);
  const visible = (await loadJobs(await jobScope(me))).filter((j) =>
    (BOARD_COLUMNS as readonly string[]).includes(j.status),
  );

  // Kunden-Filter (?k=id1,id2): Admins alle Kunden, Cutter ihre freigegebenen + die aus eigenen Projekten
  const allClients = await listUsers("kunde");
  const allowedIds =
    me.role === "admin" ? null : new Set([...(await clientIdsOfCutter(me.id)), ...visible.map((j) => j.customerId)]);
  const clients = allClients.filter((c) => !allowedIds || allowedIds.has(c.id));
  const pickedClients =
    typeof params.k === "string" ? params.k.split(",").filter((id) => clients.some((c) => c.id === id)) : [];

  // Formatfilter (?f=shortform,longform) – ohne Angabe alle. Beide Filter wirken gemeinsam.
  const formats = parseFormatFilter(params.f);
  const allFormats = formats.length === FORMATS.length;
  const clientQuery = pickedClients.length > 0 ? `k=${pickedClients.join(",")}` : "";
  const query = [clientQuery, allFormats ? "" : `f=${formats.join(",")}`].filter(Boolean).join("&");
  const href = (extra?: string) => {
    const q = [query, extra].filter(Boolean).join("&");
    return q ? `/board?${q}` : "/board";
  };

  const jobs = visible.filter(
    (j) => formats.includes(j.format) && (pickedClients.length === 0 || pickedClients.includes(j.customerId)),
  );

  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHeader title="Board">
        <div className="flex flex-wrap items-center gap-2">
          {clients.length > 0 && (
            <ClientFilter clients={clients.map((c) => ({ id: c.id, name: c.name }))} selected={pickedClients} />
          )}
          <FormatFilter active={formats} basePath="/board" extraQuery={clientQuery} />
        </div>
      </PageHeader>

      {/* Nur falls Frame.io (noch) nicht verbunden ist – sonst unsichtbar */}
      {me.role === "admin" && !(await isConnected()) && (
        <div
          className="mx-4 mb-6 flex flex-wrap sm:mx-6 items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm md:mx-10"
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

      {/* Ein Board für alle Formate – oben per Filter auf Shortform / Longform / Clipping eingrenzen */}
      <div className="px-4 pb-10 sm:px-6 md:px-10">
        <Kanban jobs={jobs} meId={me.id} unread={unread} logos={logos} hrefFor={(id) => href(`job=${id}`)} />
      </div>

      {openJob && <JobDrawer jobId={openJob} closeHref={href()} me={me} />}
    </>
  );
}
