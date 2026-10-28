import { formatDate } from "./ui";

// Roter Hinweis wie „Neu“ – erscheint 2 Tage vor der Deadline und danach (Text aus lib/deadline.ts)
export function DeadlineBadge({ label, date }: { label: string | null; date?: string | null }) {
  if (!label) return null;
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white"
      style={{ background: "var(--danger)" }}
      title={date ? `Deadline: ${formatDate(date)}` : undefined}
      data-testid="deadline-badge"
    >
      ⏰ {label}
    </span>
  );
}
