import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadInbox } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { StatusBadge, formatDateTime } from "@/app/components/ui";
import { MarkAllReadButton } from "./mark-all-read";

const TYPE_ICON: Record<string, string> = {
  file: "📎",
  comment: "💬",
  storno_request: "⏸",
  storno_decision: "⚖️",
};

// Inbox wie in Notion: Kommentare, nachgereichte Dateien und Storno-Meldungen zu den eigenen Projekten
export default async function InboxPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const items = await loadInbox(me.id);
  const unread = items.filter((i) => !i.readAt).length;
  const hrefFor = (jobId: string) => (me.role === "kunde" ? `/kunde?job=${jobId}` : `/board?job=${jobId}`);

  return (
    <>
      <PageHeader title="Inbox">{unread > 0 && <MarkAllReadButton />}</PageHeader>
      <div className="max-w-3xl px-4 pb-10 sm:px-6 md:px-10">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
            Alles ruhig. Neue Kommentare und nachgereichte Dateien erscheinen hier.
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={hrefFor(n.jobId)}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface ${n.readAt ? "" : "bg-accent/5"}`}
                >
                  <span aria-hidden className="pt-0.5 text-base">
                    {TYPE_ICON[n.type] ?? "•"}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`truncate text-sm ${n.readAt ? "text-muted" : "font-medium"}`}>{n.jobTitle}</span>
                      <StatusBadge status={n.jobStatus} />
                    </div>
                    <p className={`text-sm ${n.readAt ? "text-muted" : ""}`}>{n.text}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-xs text-muted">{formatDateTime(n.createdAt)}</span>
                    {!n.readAt && <span className="size-2 rounded-full bg-rec" aria-label="ungelesen" />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
