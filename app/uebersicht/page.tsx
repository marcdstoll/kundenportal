import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, jobs as jobsTable } from "@/db/schema";
import { getCurrentUser, resolveCustomerView } from "@/lib/session";
import { loadJobs, loadViewFilters, unreadByJob } from "@/lib/queries";
import { calendarLockReason } from "@/lib/calendar-lock";
import { jobDeadlineWarning, todayVienna } from "@/lib/deadline";
import { ViewAsBanner } from "@/app/components/shell";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { Calendar, parseMonth } from "@/app/components/calendar";
import { CustomerProjects } from "@/app/components/customer-projects";
import { CustomerJobDrawer } from "@/app/components/job-drawer";
import { DeadlineBadge } from "@/app/components/deadline-badge";
import { Avatar, FormatTag, buttonPrimary, formatDate } from "@/app/components/ui";
import { Banner, Sections } from "./overview-ui";

// Übersicht für Kunden – hier landen sie nach dem Login.
// Oben das Banner (setzen nur Admins, in der Kundenansicht), darunter die Projekte, die auf die Abnahme
// des Kunden warten (seine Aufgaben), und aufklappbar Kalender und Projektübersicht (wie die eigenen Seiten).
export default function UebersichtPage({ searchParams }: PageProps<"/uebersicht">) {
  return <Content searchParams={searchParams} />;
}

const SECTION_IDS = ["kalender", "projekte"];

async function Content({ searchParams }: { searchParams: PageProps<"/uebersicht">["searchParams"] }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const params = await searchParams;
  const asParam = typeof params.as === "string" ? params.as : undefined;
  const view = await resolveCustomerView(me, asParam);
  if (!view) {
    if (me.role !== "kunde") redirect("/board");
    return (
      <p className="m-10 rounded-xl border border-dashed border-line p-6 text-sm text-muted">
        Dein Zugang ist noch keinem Kunden zugeordnet. Bitte melde dich bei uns.
      </p>
    );
  }
  const { customer, viewAs } = view;
  const month = parseMonth(typeof params.m === "string" ? params.m : undefined);
  const openJob = typeof params.job === "string" ? params.job : null;

  const query = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    if (viewAs) p.set("as", viewAs.id);
    if (typeof params.m === "string") p.set("m", params.m);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const q = p.toString();
    return q ? `/uebersicht?${q}` : "/uebersicht";
  };
  const withAs = (path: string) => (viewAs ? `${path}?as=${viewAs.id}` : path);

  const [[info], jobs, unread, saved] = await Promise.all([
    db
      .select({
        hasBanner: sql<boolean>`${customers.banner} is not null`,
        bannerPos: customers.bannerPos,
        hasLogo: sql<boolean>`${customers.logo} is not null`,
        version: customers.updatedAt,
      })
      .from(customers)
      .where(eq(customers.id, customer.id)),
    loadJobs(eq(jobsTable.customerId, customer.id)),
    unreadByJob(me.id),
    loadViewFilters(me.id, "uebersicht"),
  ]);
  const v = info?.version.getTime() ?? 0;
  const bannerUrl = info?.hasBanner ? `/api/banner/${customer.id}?v=${v}` : null;
  const logoUrl = info?.hasLogo ? `/api/logo/${customer.id}?v=${v}` : null;
  const initialOpen = (saved.o ?? "").split(",").filter((s) => SECTION_IDS.includes(s));

  // Aufgaben des Kunden: alles in „Kundenabnahme“, nächstes Veröffentlichungsdatum zuerst
  const today = todayVienna();
  const tasks = jobs
    .filter((j) => j.status === "feedback_client")
    .sort((a, b) => (a.publishDate ?? "9999").localeCompare(b.publishDate ?? "9999"));

  return (
    <>
      <ViewAsBanner viewAs={viewAs} />
      <AutoRefresh seconds={30} />
      <Banner customerId={customer.id} url={bannerUrl} pos={info?.bannerPos ?? 50} canEdit={me.role === "admin"} />

      <div className="space-y-8 px-4 pb-10 sm:px-6 md:px-10">
        <header className={`flex flex-wrap items-end justify-between gap-4 ${bannerUrl ? "-mt-8" : "pt-8"}`}>
          <div className="space-y-3">
            <span className="relative block w-fit rounded-full bg-canvas p-1">
              <Avatar name={customer.name} id={customer.id} size="lg" logoUrl={logoUrl} />
            </span>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{customer.name}</h1>
          </div>
          {!viewAs && (
            <Link href="/neu" className={buttonPrimary}>
              Projekt anlegen
            </Link>
          )}
        </header>

        <section className="space-y-3" aria-labelledby="aufgaben">
   
          <div className="max-w-3xl overflow-hidden rounded-xl border border-line bg-surface">
            <h2 id="aufgaben" className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-medium">
              {viewAs ? `Wartet auf Abnahme durch ${customer.name}` : "Wartet auf deine Abnahme"}
              <span className="rounded-full bg-raised px-2 py-px text-xs text-muted">{tasks.length}</span>
            </h2>
            {tasks.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted">
                {viewAs ? "Gerade wartet nichts auf die Abnahme." : "Gerade wartet nichts auf dich – alles erledigt. 🎉"}
              </p>
            ) : (
              <ul className="divide-y divide-line" aria-label="Wartet auf Abnahme">
                {tasks.map((j) => {
                  const warning = jobDeadlineWarning(j.publishDate, j.status, today);
                  const isNew = !!unread.jobs.get(j.id);
                  return (
                    <li key={j.id} data-testid="task-row">
                      <Link
                        href={query({ job: j.id })}
                        scroll={false}
                        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-raised/50"
                      >
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: "var(--st-feedback_client)" }}
                        />
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium group-hover:underline">{j.title}</span>
                            {isNew && (
                              <span
                                className="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white"
                                style={{ background: "var(--rec)" }}
                              >
                                Neu
                              </span>
                            )}
                            <DeadlineBadge label={warning} date={j.publishDate} />
                          </span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                            <FormatTag format={j.format} />
                            {j.publishDate && <span>Veröffentlichung {formatDate(j.publishDate)}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm text-accent">Ansehen →</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <Sections
          initialOpen={initialOpen}
          sections={[
            {
              id: "kalender",
              title: "Kalender",
              href: withAs("/kalender"),
              hrefLabel: "Kalender öffnen",
              content: (
                <Calendar
                  month={month}
                  jobs={jobs.filter((j) => j.publishDate)}
                  showClient={false}
                  lockReason={calendarLockReason(me)}
                  hrefFor={(id) => query({ job: id })}
                  monthHref={(key) => query({ m: key })}
                />
              ),
            },
            {
              id: "projekte",
              title: "Projektübersicht",
              href: withAs("/kunde"),
              hrefLabel: "Projekte öffnen",
              content: (
                <div className="space-y-4">
                  <CustomerProjects jobs={jobs} unread={unread.jobs} hrefFor={(id) => query({ job: id })} />
                </div>
              ),
            },
          ]}
        />
      </div>

      {openJob && (
        <CustomerJobDrawer
          jobId={openJob}
          closeHref={query()}
          customerId={customer.id}
          viewerId={me.id}
          viewerRole={me.role}
        />
      )}
    </>
  );
}
