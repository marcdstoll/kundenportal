"use client";

import { useState } from "react";
import Link from "next/link";
import { markAllRead } from "@/app/actions";
import { StatusBadge, formatDateTime } from "./ui";

export type InboxItem = {
  id: string;
  jobId: string | null; // Projekt-Meldung …
  featureId: string | null; // … oder Featureboard-Meldung
  type: string;
  text: string;
  createdAt: Date;
  read: boolean;
  title: string;
  jobStatus: string | null;
};

const TYPE_ICON: Record<string, string> = {
  file: "📎",
  comment: "💬",
  storno_request: "⏸",
  storno_decision: "⚖️",
  status: "🎬",
  feature: "💡",
  feature_comment: "💬",
  feature_status: "🏷",
};

function Bell() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" />
    </svg>
  );
}

// Glocke mit Zähler; Klick öffnet ein kleines Fenster mit den letzten Meldungen (scrollbar)
export function InboxButton({ items, unread, jobHref }: { items: InboxItem[]; unread: number; jobHref: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={unread ? `Inbox, ${unread} ungelesen` : "Inbox"}
        title="Inbox"
        className={`relative rounded-md p-1.5 transition-colors hover:bg-raised ${open ? "bg-raised text-text" : "text-muted hover:text-text"}`}
      >
        <Bell />
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4 text-white"
            style={{ background: "var(--rec)" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Inbox"
            className="fixed left-4 right-4 top-14 z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl md:left-[15.5rem] md:right-auto md:top-3 md:w-[22rem]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              <span className="text-sm font-medium">Inbox</span>
              {unread > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  className="text-xs text-accent hover:underline disabled:opacity-50"
                  onClick={async () => {
                    setBusy(true);
                    await markAllRead();
                    setBusy(false);
                  }}
                >
                  Alle als gelesen markieren
                </button>
              )}
            </div>
            <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto">
              {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Keine Meldungen.</li>}
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.featureId ? `/featureboard?f=${n.featureId}` : jobHref.replace("JOBID", n.jobId ?? "")}
                    scroll={false}
                    onClick={() => setOpen(false)}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-raised/60 ${n.read ? "" : "bg-accent/5"}`}
                  >
                    <span aria-hidden className="pt-0.5">
                      {TYPE_ICON[n.type] ?? "•"}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-sm ${n.read ? "text-muted" : "font-medium"}`}>{n.title}</span>
                        {n.jobStatus ? (
                          <StatusBadge status={n.jobStatus} />
                        ) : (
                          <span className="shrink-0 rounded bg-raised px-1.5 py-px text-[11px] text-muted">Featureboard</span>
                        )}
                      </div>
                      <p className={`line-clamp-2 text-sm ${n.read ? "text-muted" : ""}`}>{n.text}</p>
                      <p className="text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                    </div>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-rec" aria-label="ungelesen" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
