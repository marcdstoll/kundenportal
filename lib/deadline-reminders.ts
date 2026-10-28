import { randomUUID } from "crypto";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { jobCutters, jobs, notifications, todos, user } from "@/db/schema";
import { memberIds } from "@/lib/queries";
import { DEADLINE_WARN_DAYS, daysUntil, deadlineLabel, todayVienna } from "@/lib/deadline";
import { formatDate } from "@/app/components/ui";

// Erinnerung 2 Tage vor der Deadline (Glocke). Läuft mit dem stündlichen Cron; jede Meldung nur einmal:
// Projekte je Termin + Status (wechselt der Status, bekommt der neue Zuständige seine eigene Meldung),
// ToDos je Termin. Zuständig bei Projekten:
//   Kundenabnahme → Kunde · Wartet auf Feedback (Review) → Admins · To-do/Warteschlange/In Arbeit → Cutter (ohne Cutter: Admins)

const ACTIVE = ["todo", "warteschlange", "in_arbeit", "feedback", "feedback_client"];

function plusDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function adminIds() {
  return (await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"))).map((r) => r.id);
}

export async function runDeadlineReminders(today = todayVienna()) {
  const limit = plusDays(today, DEADLINE_WARN_DAYS);
  let jobNotices = 0;
  let todoNotices = 0;

  // ---------- Projekte (Deadline = Veröffentlichungsdatum) ----------
  const due = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      customerId: jobs.customerId,
      publishDate: jobs.publishDate,
      notice: jobs.deadlineNotice,
    })
    .from(jobs)
    .where(and(inArray(jobs.status, ACTIVE), isNotNull(jobs.publishDate), lte(jobs.publishDate, limit)));
  let admins: string[] | null = null;
  for (const j of due) {
    const key = `${j.publishDate}|${j.status}`;
    if (j.notice === key) continue;
    let to: string[];
    if (j.status === "feedback_client") to = await memberIds(j.customerId);
    else if (j.status === "feedback") to = admins ??= await adminIds();
    else {
      to = (await db.select({ id: jobCutters.userId }).from(jobCutters).where(eq(jobCutters.jobId, j.id))).map((r) => r.id);
      if (to.length === 0) to = admins ??= await adminIds();
    }
    const label = deadlineLabel(daysUntil(j.publishDate!, today));
    const text = `${label} (${formatDate(j.publishDate)}): „${j.title}“`;
    const ids = [...new Set(to)];
    if (ids.length) {
      await db.insert(notifications).values(ids.map((userId) => ({ id: randomUUID(), userId, jobId: j.id, type: "deadline", text })));
      jobNotices += ids.length;
    }
    await db.update(jobs).set({ deadlineNotice: key }).where(eq(jobs.id, j.id));
  }

  // ---------- ToDos ----------
  const dueTodos = await db
    .select({ id: todos.id, title: todos.title, assigneeId: todos.assigneeId, deadline: todos.deadline, notice: todos.deadlineNotice })
    .from(todos)
    .where(and(eq(todos.status, "offen"), isNotNull(todos.deadline), lte(todos.deadline, limit)));
  for (const t of dueTodos) {
    if (t.notice === t.deadline) continue;
    const label = deadlineLabel(daysUntil(t.deadline!, today));
    await db.insert(notifications).values({
      id: randomUUID(),
      userId: t.assigneeId,
      todoId: t.id,
      type: "deadline",
      text: `${label} (${formatDate(t.deadline)}): ToDo „${t.title}“`,
    });
    todoNotices++;
    await db.update(todos).set({ deadlineNotice: t.deadline }).where(eq(todos.id, t.id));
  }

  return { jobNotices, todoNotices };
}
