"use server";

// ToDos – Rechte siehe lib/todos.ts. Meldungen (Glocke): neue Zuweisung an die zuständige Person,
// Erledigt an den Ersteller. Deadline-Erinnerungen kommen über den stündlichen Cron (lib/deadline-reminders.ts).

import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { notifications, todos } from "@/db/schema";
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

export type TodoInput = { title: string; description: string; assigneeId: string; priority: string; deadline: string };

const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)} …` : s);

async function notifyTodo(todoId: string, actorId: string, userId: string | null, type: string, text: string) {
  if (!userId || userId === actorId) return;
  await db.insert(notifications).values({ id: randomUUID(), userId, todoId, type, text, actorId });
}

// Eingaben prüfen; die zuständige Person muss für den Anlegenden erlaubt sein
async function clean(me: Awaited<ReturnType<typeof requireUser>>, input: TodoInput) {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title) throw new Error("Bitte einen Titel eingeben.");
  if (title.length > 200) throw new Error("Der Titel ist zu lang (max. 200 Zeichen).");
  if (description.length > 5000) throw new Error("Die Beschreibung ist zu lang (max. 5000 Zeichen).");
  const priority = (PRIORITIES as readonly string[]).includes(input.priority) ? input.priority : "mittel";
  const deadline = input.deadline.trim() || null;
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error("Bitte ein gültiges Datum wählen.");
  const assigneeId = me.role === "kunde" ? me.id : input.assigneeId;
  if (!(await assigneeOptions(me)).some((o) => o.id === assigneeId)) {
    throw new Error("Diese Person kannst du nicht auswählen.");
  }
  return { title, description: description || null, priority, deadline, assigneeId };
}

export async function createTodo(input: TodoInput) {
  return run(async () => {
    const me = await requireUser();
    const v = await clean(me, input);
    const id = randomUUID();
    await db.insert(todos).values({ id, ...v, createdBy: me.id });
    await notifyTodo(id, me.id, v.assigneeId, "todo", `Neues ToDo von ${me.name}: „${short(v.title)}“`);
    refresh();
    return { id };
  });
}

// Bearbeiten: Ersteller und Admins
export async function updateTodo(id: string, input: TodoInput) {
  return run(async () => {
    const me = await requireUser();
    const t = await loadTodo(id);
    if (!t || !canSeeTodo(me, t)) throw new Error("ToDo nicht gefunden.");
    if (!canEditTodo(me, t)) throw new Error("Nur der Ersteller oder ein Admin kann das ToDo bearbeiten.");
    // Kunden bleiben selbst zuständig; bei Admin-Bearbeitung eines Kunden-ToDos die Person nicht verlieren
    const v = await clean(me, me.role === "kunde" ? { ...input, assigneeId: t.assigneeId } : input);
    await db.update(todos).set({ ...v, updatedAt: new Date() }).where(eq(todos.id, id));
    if (v.assigneeId !== t.assigneeId) {
      await notifyTodo(id, me.id, v.assigneeId, "todo", `${me.name} hat dir ein ToDo zugewiesen: „${short(v.title)}“`);
    }
    refresh();
    return null;
  });
}

// Status: zuständige Person und Admins
export async function setTodoStatus(id: string, status: string) {
  return run(async () => {
    const me = await requireUser();
    const t = await loadTodo(id);
    if (!t || !canSeeTodo(me, t)) throw new Error("ToDo nicht gefunden.");
    if (!canSetTodoStatus(me, t)) throw new Error("Den Status ändern nur die zuständige Person und Admins.");
    if (status !== "offen" && status !== "abgeschlossen") throw new Error("Unbekannter Status.");
    if (status === t.status) return null;
    const done = status === "abgeschlossen";
    await db
      .update(todos)
      .set({ status, doneAt: done ? new Date() : null, doneBy: done ? me.id : null, updatedAt: new Date() })
      .where(eq(todos.id, id));
    if (done) await notifyTodo(id, me.id, t.createdBy, "todo_status", `${me.name} hat „${short(t.title)}“ erledigt`);
    else await notifyTodo(id, me.id, t.assigneeId, "todo_status", `${me.name} hat „${short(t.title)}“ wieder geöffnet`);
    refresh();
    return null;
  });
}

export async function deleteTodo(id: string) {
  return run(async () => {
    const me = await requireUser();
    const t = await loadTodo(id);
    if (!t || !canSeeTodo(me, t)) throw new Error("ToDo nicht gefunden.");
    if (!canEditTodo(me, t)) throw new Error("Nur der Ersteller oder ein Admin kann das ToDo löschen.");
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
