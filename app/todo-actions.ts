"use server";

// Aufgaben (intern „todos“) – Rechte siehe lib/todos.ts. Meldungen (Glocke): neue Zuweisung an die zuständigen Personen,
// Erledigt an den Ersteller. Deadline-Erinnerungen kommen über den stündlichen Cron (lib/deadline-reminders.ts).

import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { notifications, todoAssignees, todos } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { PRIORITIES } from "@/lib/ideas";
import { assigneeOptions, canEditTodo, canSeeTodo, canSetTodoStatus, loadTodo } from "@/lib/todos";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Unbekannter Fehler" };
  }
}

export type TodoInput = { title: string; description: string; assigneeIds: string[]; priority: string; deadline: string };

const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)} …` : s);

async function notifyTodo(todoId: string, actorId: string, userIds: (string | null)[], type: string, text: string) {
  const to = [...new Set(userIds)].filter((id): id is string => !!id && id !== actorId);
  if (to.length === 0) return;
  await db.insert(notifications).values(to.map((userId) => ({ id: randomUUID(), userId, todoId, type, text, actorId })));
}

async function setAssignees(todoId: string, ids: string[]) {
  await db.delete(todoAssignees).where(eq(todoAssignees.todoId, todoId));
  if (ids.length) await db.insert(todoAssignees).values(ids.map((userId) => ({ todoId, userId })));
}

// Eingaben prüfen
function clean(input: TodoInput) {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title) throw new Error("Bitte einen Titel eingeben.");
  if (title.length > 200) throw new Error("Der Titel ist zu lang (max. 200 Zeichen).");
  if (description.length > 5000) throw new Error("Die Beschreibung ist zu lang (max. 5000 Zeichen).");
  const priority = (PRIORITIES as readonly string[]).includes(input.priority) ? input.priority : "mittel";
  const deadline = input.deadline.trim() || null;
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error("Bitte ein gültiges Datum wählen.");
  return { title, description: description || null, priority, deadline };
}

// Zuständige prüfen: müssen für den Anlegenden erlaubt sein (bereits Zuständige bleiben erlaubt).
// Kunden sind immer selbst zuständig bzw. ändern die Zuständigen nicht.
async function cleanAssignees(me: Awaited<ReturnType<typeof requireUser>>, wanted: string[], current: string[] = []) {
  if (me.role === "kunde") return current.length ? current : [me.id];
  const ids = [...new Set(wanted)];
  if (ids.length === 0) throw new Error("Bitte mindestens eine Person auswählen.");
  if (ids.length > 50) throw new Error("Zu viele Personen ausgewählt.");
  const allowed = new Set([...(await assigneeOptions(me)).map((o) => o.id), ...current]);
  if (ids.some((id) => !allowed.has(id))) throw new Error("Diese Person kannst du nicht auswählen.");
  return ids;
}

export async function createTodo(input: TodoInput) {
  return run(async () => {
    const me = await requireUser();
    const v = clean(input);
    const assigneeIds = await cleanAssignees(me, input.assigneeIds);
    const id = randomUUID();
    await db.insert(todos).values({ id, ...v, createdBy: me.id });
    await setAssignees(id, assigneeIds);
    await notifyTodo(id, me.id, assigneeIds, "todo", `Neue Aufgabe von ${me.name}: „${short(v.title)}“`);
    refresh();
    return { id };
  });
}

// Bearbeiten: Ersteller und Admins
export async function updateTodo(id: string, input: TodoInput) {
  return run(async () => {
    const me = await requireUser();
    const t = await loadTodo(id);
    if (!t || !canSeeTodo(me, t)) throw new Error("Aufgabe nicht gefunden.");
    if (!canEditTodo(me, t)) throw new Error("Nur der Ersteller oder ein Admin kann die Aufgabe bearbeiten.");
    const v = clean(input);
    const assigneeIds = await cleanAssignees(me, input.assigneeIds, t.assigneeIds);
    await db.update(todos).set({ ...v, updatedAt: new Date() }).where(eq(todos.id, id));
    await setAssignees(id, assigneeIds);
    const added = assigneeIds.filter((uid) => !t.assigneeIds.includes(uid));
    await notifyTodo(id, me.id, added, "todo", `${me.name} hat dir eine Aufgabe zugewiesen: „${short(v.title)}“`);
    refresh();
    return null;
  });
}

// Status: zuständige Person und Admins
export async function setTodoStatus(id: string, status: string) {
  return run(async () => {
    const me = await requireUser();
    const t = await loadTodo(id);
    if (!t || !canSeeTodo(me, t)) throw new Error("Aufgabe nicht gefunden.");
    if (!canSetTodoStatus(me, t)) throw new Error("Den Status ändern nur die zuständige Person und Admins.");
    if (status !== "offen" && status !== "abgeschlossen") throw new Error("Unbekannter Status.");
    if (status === t.status) return null;
    const done = status === "abgeschlossen";
    await db
      .update(todos)
      .set({ status, doneAt: done ? new Date() : null, doneBy: done ? me.id : null, updatedAt: new Date() })
      .where(eq(todos.id, id));
    if (done) await notifyTodo(id, me.id, [t.createdBy], "todo_status", `${me.name} hat „${short(t.title)}“ erledigt`);
    else await notifyTodo(id, me.id, t.assigneeIds, "todo_status", `${me.name} hat „${short(t.title)}“ wieder geöffnet`);
    refresh();
    return null;
  });
}

export async function deleteTodo(id: string) {
  return run(async () => {
    const me = await requireUser();
    const t = await loadTodo(id);
    if (!t || !canSeeTodo(me, t)) throw new Error("Aufgabe nicht gefunden.");
    if (!canEditTodo(me, t)) throw new Error("Nur der Ersteller oder ein Admin kann die Aufgabe löschen.");
    await db.delete(todos).where(eq(todos.id, id));
    refresh();
    return null;
  });
}

export async function markTodoRead(id: string) {
  return run(async () => {
    const me = await requireUser();
    const updated = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, me.id), eq(notifications.todoId, id), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    if (updated.length > 0) refresh();
    return null;
  });
}
