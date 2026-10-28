import { eq, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customerMembers, customers, todos, user } from "@/db/schema";
import { clientIdsOfCutter } from "@/lib/access";

// ToDos – Regeln:
// - sehen: zuständige Person, Ersteller, Admins
// - anlegen: Admins/Cutter für eine Person ihrer Wahl (Cutter: Team + Nutzer ihrer freigegebenen Kunden),
//   Kunden nur für sich selbst
// - bearbeiten (Titel, Beschreibung, Zuständig, Priorität, Deadline) und löschen: Ersteller und Admins
// - Status (offen/abgeschlossen): zuständige Person und Admins

export const TODO_STATUSES = ["offen", "abgeschlossen"] as const;

type Viewer = { id: string; role: string };
type TodoRow = typeof todos.$inferSelect;

export const canSeeTodo = (me: Viewer, t: Pick<TodoRow, "assigneeId" | "createdBy">) =>
  me.role === "admin" || t.assigneeId === me.id || t.createdBy === me.id;
export const canEditTodo = (me: Viewer, t: Pick<TodoRow, "createdBy">) => me.role === "admin" || t.createdBy === me.id;
export const canSetTodoStatus = (me: Viewer, t: Pick<TodoRow, "assigneeId">) =>
  me.role === "admin" || t.assigneeId === me.id;

// Filter für die Liste: Admins alles, sonst nur zugewiesene oder selbst erstellte
export function todoScope(me: Viewer): SQL | undefined {
  if (me.role === "admin") return undefined;
  return or(eq(todos.assigneeId, me.id), eq(todos.createdBy, me.id));
}

export type AssigneeOption = { id: string; label: string; role: string };

const ROLE = { admin: "Admin", cutter: "Cutter", kunde: "Kunde" } as Record<string, string>;

// Wen darf diese Person als zuständig eintragen?
export async function assigneeOptions(me: Viewer & { name: string }): Promise<AssigneeOption[]> {
  if (me.role === "kunde") return [{ id: me.id, label: me.name, role: "kunde" }];
  const team = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(inArray(user.role, ["admin", "cutter"]));
  // Kunden-Nutzer mit Firmennamen; Cutter nur die ihrer freigegebenen Kunden
  const allowed = me.role === "cutter" ? await clientIdsOfCutter(me.id) : null;
  const clients =
    allowed && allowed.length === 0
      ? []
      : await db
          .select({ id: user.id, name: user.name, firm: customers.name })
          .from(customerMembers)
          .innerJoin(user, eq(user.id, customerMembers.userId))
          .innerJoin(customers, eq(customers.id, customerMembers.customerId))
          .where(allowed ? inArray(customerMembers.customerId, allowed) : undefined);
  const byName = (a: AssigneeOption, b: AssigneeOption) => a.label.localeCompare(b.label);
  return [
    ...team.map((u) => ({ id: u.id, label: `${u.name} (${ROLE[u.role ?? ""] ?? u.role})`, role: u.role ?? "cutter" })).sort(byName),
    ...clients
      .map((c) => ({ id: c.id, label: c.name === c.firm ? `${c.name} (Kunde)` : `${c.name} (Kunde · ${c.firm})`, role: "kunde" }))
      .sort(byName),
  ];
}

export async function loadTodo(id: string) {
  const [t] = await db.select().from(todos).where(eq(todos.id, id));
  return t ?? null;
}
