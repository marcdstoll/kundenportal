import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, jobs as jobsTable, todos, user } from "@/db/schema";
import { getCurrentUser, resolveCustomerView } from "@/lib/session";
import { loadJobs, loadViewFilters, memberIds, unreadByJob } from "@/lib/queries";
import { calendarLockReason } from "@/lib/calendar-lock";
import { jobDeadlineWarning, todayVienna, todoDeadlineWarning } from "@/lib/deadline";
import { PRIORITY_COLORS } from "@/lib/ideas";
import { ViewAsBanner } from "@/app/components/shell";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { Calendar, parseMonth } from "@/app/components/calendar";
import { CustomerProjects } from "@/app/components/customer-projects";
import { CustomerJobDrawer } from "@/app/components/job-drawer";
import { DeadlineBadge } from "@/app/components/deadline-badge";
import { Avatar, FormatTag, buttonPrimary, formatDate } from "@/app/components/ui";
import { PriorityChip } from "@/app/todos/todo-ui";
import { Banner, Sections } from "./overview-ui";

// Übersicht für Kunden – hier landen sie nach dem Login.
// Oben das Banner (setzen nur Admins, in der Kundenansicht), darunter „Aufgaben“: Projekte in Kundenabnahme
// und offene ToDos für den Kunden. Aufklappbar Kalender und Projektübersicht (wie die eigenen Seiten).
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

  // Offene ToDos für den Kunden: der Kunde sieht seine eigenen, Admins in der Kundenansicht die aller Nutzer des Kunden
  const assignees = viewAs ? await memberIds(customer.id) : [me.id];
  const openTodos = assignees.length
    ? await db
        .select({
          id: todos.id,
          title: todos.title,
          priority: todos.priority,
          status: todos.status,
          deadline: todos.deadline,
          assigneeName: user.name,
        })
        .from(todos)
        .innerJoin(user, eq(user.id, todos.assigneeId))
        .where(and(eq(todos.status, "offen"), inArray(todos.assigneeId, assignees)))
    : [];
  const v = info?.version.getTime() ?? 0;
  const bannerUrl = info?.hasBanner ? `/api/banner/${customer.id}?v=${v}` : null;
  const logoUrl = info?.hasLogo ? `/api/logo/${customer.id}?v=${v}` : null;
  const initialOpen = (saved.o ?? "").split(",").filter((s) => SECTION_IDS.includes(s));

  // Aufgaben: Projekte in „Kundenabnahme“ und offene ToDos, nächster Termin zuerst (ohne Termin ans Ende)
  const today = todayVienna();
  const tasks = [
    ...jobs.filter((j) => j.status === "feedback_client").map((job) => ({ kind: "job" as const, date: job.publishDate, job })),
    ...openTodos.map((todo) => ({ kind: "todo" as const, date: todo.deadline, todo })),
  ].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

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
              Aufgaben
              <span className="rounded-full bg-raised px-2 py-px text-xs text-muted">{tasks.length}</span>
            </h2>
            {tasks.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted">
                {viewAs ? "Gerade gibt es keine offenen Aufgaben." : "Gerade gibt es nichts zu tun – alles erledigt. 🎉"}
              </p>
            ) : (
              <ul className="divide-y divide-line" aria-label="Aufgaben">
                {tasks.map((t) =>
                  t.kind === "job" ? (
                    <TaskRow
                      key={t.job.id}
                      kind="job"
                      href={query({ job: t.job.id })}
                      title={t.job.title}
                      color="var(--st-feedback_client)"
                      isNew={!!unread.jobs.get(t.job.id)}
                      warning={jobDeadlineWarning(t.job.publishDate, t.job.status, today)}
                      date={t.job.publishDate}
                      meta={
                        <>
                          <span className="font-medium text-[var(--st-feedback_client)]">Abnahme</span>
                          <FormatTag format={t.job.format} />
                          {t.job.publishDate && <span>Veröffentlichung {formatDate(t.job.publishDate)}</span>}
                        </>
                      }
                    />
                  ) : (
                    <TaskRow
                      key={t.todo.id}
                      kind="todo"
                      href={`/todos?t=${t.todo.id}`}
                      title={t.todo.title}
                      color={PRIORITY_COLORS[t.todo.priority] ?? "var(--muted)"}
                      isNew={!!unread.todos.get(t.todo.id)}
                      warning={todoDeadlineWarning(t.todo.deadline, t.todo.status, today)}
                      date={t.todo.deadline}
                      meta={
                        <>
                          <span className="font-medium text-text">ToDo</span>
                          <PriorityChip priority={t.todo.priority} />
                          {t.todo.deadline && <span>Deadline {formatDate(t.todo.deadline)}</span>}
                          {viewAs && <span>für {t.todo.assigneeName}</span>}
                        </>
                      }
                    />
                  ),
                )}
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

// Eine Zeile in „Aufgaben“ (Projekt in Kundenabnahme oder ToDo)
function TaskRow({
  kind,
  href,
  title,
  color,
  isNew,
  warning,
  date,
  meta,
}: {
  kind: "job" | "todo";
  href: string;
  title: string;
  color: string;
  isNew: boolean;
  warning: string | null;
  date: string | null;
  meta: React.ReactNode;
}) {
  return (
    <li data-testid="task-row" data-kind={kind}>
      <Link
        href={href}
        scroll={false}
        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-raised/50"
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium group-hover:underline">{title}</span>
            {isNew && (
              <span
                className="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white"
                style={{ background: "var(--rec)" }}
              >
                Neu
              </span>
            )}
            <DeadlineBadge label={warning} date={date} />
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">{meta}</span>
        </span>
        <span className="shrink-0 text-sm text-accent">{kind === "job" ? "Ansehen" : "Öffnen"} →</span>
      </Link>
    </li>
  );
}
