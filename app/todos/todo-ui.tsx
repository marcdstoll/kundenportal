"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlideOver } from "@/app/components/slide-over";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { LinkedText } from "@/app/components/linked-text";
import { DeadlineBadge } from "@/app/components/deadline-badge";
import { buttonPrimary, buttonSecondary, formatDate, formatDateTime, inputField } from "@/app/components/ui";
import { PRIORITIES, PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/ideas";
import {
  createTodo,
  deleteTodo,
  markTodoRead,
  setTodoStatus,
  updateTodo,
  type TodoInput,
} from "@/app/todo-actions";
import type { AssigneeOption } from "@/lib/todos";

export type TodoView = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  deadline: string | null;
  warning: string | null; // Deadline-Hinweis (2 Tage vorher), sonst null
  assigneeId: string;
  assigneeName: string;
  creatorName: string | null;
  createdByMe: boolean;
  assignedToMe: boolean;
  createdAt: string;
  doneAt: string | null;
  doneByName: string | null;
  canEdit: boolean;
  canStatus: boolean;
  unread: boolean;
};

export function PriorityChip({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] ?? "var(--muted)";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[11px]"
      style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}

// ---------- Formular (neu + bearbeiten) ----------

function TodoForm({
  initial,
  options,
  isKunde,
  onDone,
  todoId,
}: {
  initial: TodoInput;
  options: AssigneeOption[];
  isKunde: boolean;
  onDone: () => void;
  todoId?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof TodoInput, value: string) => setV((x) => ({ ...x, [k]: value }));

  return (
    <form
      className="space-y-4"
      aria-label={todoId ? "ToDo bearbeiten" : "Neues ToDo"}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const res = todoId ? await updateTodo(todoId, v) : await createTodo(v);
          if (!res.ok) return setError(res.error);
          onDone();
          router.refresh();
        });
      }}
    >
      <label className="block space-y-1">
        <span className="text-sm text-muted">Titel</span>
        <input
          className={inputField}
          value={v.title}
          maxLength={200}
          onChange={(e) => set("title", e.target.value)}
          disabled={pending}
          placeholder="Was ist zu tun?"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-muted">Beschreibung</span>
        <textarea
          className={`${inputField} min-h-28`}
          value={v.description}
          maxLength={5000}
          onChange={(e) => set("description", e.target.value)}
          disabled={pending}
        />
      </label>
      {!isKunde && (
        <label className="block space-y-1">
          <span className="text-sm text-muted">Zuständig</span>
          <select
            className={inputField}
            value={v.assigneeId}
            onChange={(e) => set("assigneeId", e.target.value)}
            disabled={pending}
          >
            <option value="">Person wählen …</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm text-muted">Priorität</span>
          <select
            className={inputField}
            value={v.priority}
            onChange={(e) => set("priority", e.target.value)}
            disabled={pending}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted">Deadline (optional)</span>
          <input
            type="date"
            className={inputField}
            value={v.deadline}
            onChange={(e) => set("deadline", e.target.value)}
            disabled={pending}
          />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className={buttonPrimary} disabled={pending || !v.title.trim() || !v.assigneeId}>
          {pending ? "Speichert …" : todoId ? "Speichern" : "ToDo anlegen"}
        </button>
        <button type="button" className={buttonSecondary} disabled={pending} onClick={onDone}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

export function NewTodoButton({
  options,
  isKunde,
  meId,
}: {
  options: AssigneeOption[];
  isKunde: boolean;
  meId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={buttonPrimary} onClick={() => setOpen(true)}>
        + Neues ToDo
      </button>
      <SlideOver open={open} title="Neues ToDo" onClose={() => setOpen(false)}>
        {open && (
          <TodoForm
            initial={{ title: "", description: "", assigneeId: isKunde ? meId : "", priority: "mittel", deadline: "" }}
            options={options}
            isKunde={isKunde}
            onDone={() => setOpen(false)}
          />
        )}
      </SlideOver>
    </>
  );
}

// ---------- Liste + Detail-Panel ----------

function StatusToggle({ todo, compact = false }: { todo: TodoView; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const done = todo.status === "abgeschlossen";
  const toggle = () =>
    startTransition(async () => {
      await setTodoStatus(todo.id, done ? "offen" : "abgeschlossen");
      router.refresh();
    });
  if (compact) {
    return (
      <input
        type="checkbox"
        className="size-4 shrink-0 cursor-pointer accent-[var(--accent)] disabled:cursor-default"
        checked={done}
        disabled={!todo.canStatus || pending}
        onChange={toggle}
        aria-label={done ? `„${todo.title}“ wieder öffnen` : `„${todo.title}“ abschließen`}
        title={todo.canStatus ? undefined : "Status ändern nur die zuständige Person und Admins"}
      />
    );
  }
  if (!todo.canStatus) return null;
  return (
    <button type="button" className={done ? buttonSecondary : buttonPrimary} disabled={pending} onClick={toggle}>
      {done ? "Wieder öffnen" : "Als erledigt markieren"}
    </button>
  );
}

function Detail({
  todo,
  options,
  isKunde,
  onClose,
}: {
  todo: TodoView;
  options: AssigneeOption[];
  isKunde: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Meldungen zu diesem ToDo als gelesen markieren
  useEffect(() => {
    if (todo.unread) markTodoRead(todo.id);
  }, [todo.id, todo.unread]);

  if (editing) {
    return (
      <TodoForm
        todoId={todo.id}
        initial={{
          title: todo.title,
          description: todo.description ?? "",
          assigneeId: todo.assigneeId,
          priority: todo.priority,
          deadline: todo.deadline ?? "",
        }}
        options={options.some((o) => o.id === todo.assigneeId) ? options : [{ id: todo.assigneeId, label: todo.assigneeName, role: "" }, ...options]}
        isKunde={isKunde}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="break-words text-lg font-semibold">{todo.title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-1.5 py-px text-[11px] ${todo.status === "abgeschlossen" ? "bg-[color-mix(in_oklab,var(--st-online)_18%,transparent)] text-[var(--st-online)]" : "bg-raised text-muted"}`}
          >
            {todo.status === "abgeschlossen" ? "Abgeschlossen" : "Offen"}
          </span>
          <PriorityChip priority={todo.priority} />
          <DeadlineBadge label={todo.warning} date={todo.deadline} />
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Zuständig</dt>
        <dd>{todo.assigneeName}</dd>
        <dt className="text-muted">Von</dt>
        <dd>{todo.createdByMe ? "dir" : (todo.creatorName ?? "Gelöschter Nutzer")}</dd>
        <dt className="text-muted">Deadline</dt>
        <dd>{todo.deadline ? formatDate(todo.deadline) : <span className="text-muted">–</span>}</dd>
        <dt className="text-muted">Erstellt</dt>
        <dd>{formatDateTime(todo.createdAt)}</dd>
        {todo.doneAt && (
          <>
            <dt className="text-muted">Erledigt</dt>
            <dd>
              {formatDateTime(todo.doneAt)}
              {todo.doneByName && <span className="text-muted"> · {todo.doneByName}</span>}
            </dd>
          </>
        )}
      </dl>
      {todo.description && <LinkedText text={todo.description} className="text-sm" />}
      <div className="flex flex-wrap gap-2">
        <StatusToggle todo={todo} />
        {todo.canEdit && (
          <>
            <button type="button" className={buttonSecondary} onClick={() => setEditing(true)}>
              Bearbeiten
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-2 text-sm text-danger hover:bg-danger/10"
              onClick={() => setConfirm(true)}
            >
              Löschen
            </button>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title="ToDo löschen?"
        message={`„${todo.title}“ wird endgültig gelöscht.`}
        confirmLabel="Löschen"
        busy={busy}
        error={error}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          const res = await deleteTodo(todo.id);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setConfirm(false);
          onClose();
          router.refresh();
        }}
      />
    </div>
  );
}

export function TodoList({
  todos,
  extra,
  options,
  isKunde,
  initialOpenId,
}: {
  todos: TodoView[];
  extra: TodoView | null;
  options: AssigneeOption[];
  isKunde: boolean;
  initialOpenId: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const open = todos.find((t) => t.id === openId) ?? (extra && extra.id === openId ? extra : null);

  return (
    <>
      {todos.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
          Keine ToDos mit diesem Filter.
        </p>
      )}
      <ul hidden={todos.length === 0} className="divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="ToDos">
        {todos.map((t) => (
          <li key={t.id} className="flex items-start gap-3 bg-surface px-4 py-3" data-testid="todo-row">
            <span className="pt-0.5">
              <StatusToggle todo={t} compact />
            </span>
            <button type="button" className="min-w-0 flex-1 space-y-1 text-left" onClick={() => setOpenId(t.id)}>
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={`font-medium hover:underline ${t.status === "abgeschlossen" ? "text-muted line-through" : ""}`}
                >
                  {t.title}
                </span>
                {t.unread && (
                  <span
                    className="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white"
                    style={{ background: "var(--rec)" }}
                  >
                    Neu
                  </span>
                )}
                <DeadlineBadge label={t.warning} date={t.deadline} />
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <PriorityChip priority={t.priority} />
                <span>{t.assignedToMe ? "Dir zugewiesen" : `Zuständig: ${t.assigneeName}`}</span>
                {!t.createdByMe && t.creatorName && <span>von {t.creatorName}</span>}
                {t.deadline && <span>Deadline {formatDate(t.deadline)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <SlideOver open={!!open} title="ToDo" onClose={() => setOpenId(null)}>
        {open && (
          <Detail key={open.id} todo={open} options={options} isKunde={isKunde} onClose={() => setOpenId(null)} />
        )}
      </SlideOver>
    </>
  );
}
