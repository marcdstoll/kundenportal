import { redirect } from "next/navigation";
import { and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { todos, user } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { loadViewFilters, unreadByJob } from "@/lib/queries";
import { PRIORITY_RANK } from "@/lib/ideas";
import { todayVienna, todoDeadlineWarning } from "@/lib/deadline";
import { assigneeOptions, canEditTodo, canSetTodoStatus, todoScope } from "@/lib/todos";
import { PageHeader } from "@/app/components/shell";
import { FilterButton } from "@/app/components/filter-button";
import { NewTodoButton, TodoList, type TodoView } from "./todo-ui";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function TodosPage({ searchParams }: { searchParams: Params }) {
  return <Content searchParams={searchParams} />;
}

const STATUS_TABS = [
  { value: "offen", label: "Offen" },
  { value: "abgeschlossen", label: "Abgeschlossen" },
  { value: "alle", label: "Alle" },
];
const MINE_TABS = [
  { value: "alle", label: "Alle" },
  { value: "mir", label: "Mir zugewiesen" },
  { value: "erstellt", label: "Von mir erstellt" },
];

// ToDos für Admins, Cutter und Kunden.
// Sichtbar: Admins alles; alle anderen nur, was ihnen zugewiesen ist oder was sie selbst erstellt haben.
// Filter (Status s, Zuordnung m) werden pro Nutzer gespeichert.
async function Content({ searchParams }: { searchParams: Params }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const params = await searchParams;
  const isKunde = me.role === "kunde";
  const saved = await loadViewFilters(me.id, "todos");
  const status = STATUS_TABS.some((t) => t.value === saved.s) ? saved.s : "offen";
  const mine = MINE_TABS.some((t) => t.value === saved.m) ? saved.m : "alle";
  const openId = typeof params.t === "string" ? params.t : null;

  const [rows, options, unread] = await Promise.all([
    db.select().from(todos).where(and(todoScope(me))),
    assigneeOptions(me),
    unreadByJob(me.id).then((u) => u.todos),
  ]);

  const nameIds = [...new Set(rows.flatMap((t) => [t.assigneeId, t.createdBy, t.doneBy]).filter(Boolean))] as string[];
  const names = new Map(
    nameIds.length
      ? (await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, nameIds))).map(
          (u) => [u.id, u.name] as const,
        )
      : [],
  );

  const today = todayVienna();
  const byMine = rows.filter(
    (t) => mine === "alle" || (mine === "mir" ? t.assigneeId === me.id : t.createdBy === me.id),
  );
  const statusCount = (s: string) => byMine.filter((t) => s === "alle" || t.status === s).length;
  const mineCount = (m: string) =>
    rows.filter(
      (t) =>
        (status === "alle" || t.status === status) &&
        (m === "alle" || (m === "mir" ? t.assigneeId === me.id : t.createdBy === me.id)),
    ).length;

  // Offene zuerst, dann nächste Deadline (ohne Deadline hinten), dann Priorität, dann neueste
  const list = byMine
    .filter((t) => status === "alle" || t.status === status)
    .sort(
      (a, b) =>
        Number(a.status === "abgeschlossen") - Number(b.status === "abgeschlossen") ||
        (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
        (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );

  const toView = (t: (typeof rows)[number]): TodoView => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    deadline: t.deadline,
    warning: todoDeadlineWarning(t.deadline, t.status, today),
    assigneeId: t.assigneeId,
    assigneeName: names.get(t.assigneeId) ?? "–",
    creatorName: t.createdBy ? (names.get(t.createdBy) ?? null) : null,
    createdByMe: t.createdBy === me.id,
    assignedToMe: t.assigneeId === me.id,
    createdAt: t.createdAt.toISOString(),
    doneAt: t.doneAt ? t.doneAt.toISOString() : null,
    doneByName: t.doneBy ? (names.get(t.doneBy) ?? null) : null,
    canEdit: canEditTodo(me, t),
    canStatus: canSetTodoStatus(me, t),
    unread: !!unread.get(t.id),
  });
  const view = list.map(toView);
  // Aus der Inbox geöffnet, aber vom Filter ausgeblendet → trotzdem anzeigen
  const hidden = openId && !list.some((t) => t.id === openId) ? rows.find((t) => t.id === openId) : undefined;

  const tabClass = (active: boolean) =>
    `-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
      active ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text"
    }`;
  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${
      active ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:text-text"
    }`;

  return (
    <>
      <PageHeader title="ToDos">
        <NewTodoButton options={options} isKunde={isKunde} meId={me.id} />
      </PageHeader>

      <div className="space-y-4 px-4 pb-10 sm:px-6 md:px-10">
        {isKunde && (
          <p className="max-w-2xl text-sm text-muted">
            Hier siehst du ToDos, die dir zugewiesen sind, und kannst dir eigene anlegen.
          </p>
        )}

        <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="ToDos nach Status">
          {STATUS_TABS.map((t) => (
            <FilterButton
              key={t.value}
              view="todos"
              patch={{ s: t.value }}
              aria-current={t.value === status ? "page" : undefined}
              className={tabClass(t.value === status)}
            >
              {t.label} <span className="text-xs text-muted">{statusCount(t.value)}</span>
            </FilterButton>
          ))}
        </nav>

        {!isKunde && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Zuordnung">
            {MINE_TABS.map((t) => (
              <FilterButton
                key={t.value}
                view="todos"
                patch={{ m: t.value }}
                aria-pressed={t.value === mine}
                className={chipClass(t.value === mine)}
              >
                {t.label} <span className="text-muted">{mineCount(t.value)}</span>
              </FilterButton>
            ))}
          </div>
        )}

        <TodoList
          key={openId ?? ""}
          todos={view}
          extra={hidden ? toView(hidden) : null}
          options={options}
          isKunde={isKunde}
          initialOpenId={openId}
        />
        <p className="text-xs text-muted">Gesamt: {view.length}</p>
      </div>
    </>
  );
}
