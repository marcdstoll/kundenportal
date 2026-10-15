"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { setPublishDate } from "@/app/actions";
import { statusColor } from "@/lib/status";
import { FormatTag, StatusBadge } from "./ui";

export type CalendarDay = { key: string; day: number; inMonth: boolean; isToday: boolean };
export type CalendarItem = {
  id: string;
  title: string;
  customerName: string;
  format: string;
  status: string;
  date: string; // "YYYY-MM-DD"
  href: string;
  canMove: boolean;
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DRAG_TYPE = "application/x-calendar-item";

// Monatsraster mit Drag & Drop: Termin greifen, auf einen anderen Tag ziehen, loslassen.
// Die Karte springt sofort um (optimistisch); der Server speichert und bestätigt danach.
export function CalendarGrid({ days, items, showClient }: { days: CalendarDay[]; items: CalendarItem[]; showClient: boolean }) {
  // Verschiebungen, die der Server noch nicht bestätigt hat
  const [optimisticItems, moveItem] = useOptimistic(items, (current, move: { id: string; date: string }) =>
    current.map((it) => (it.id === move.id ? { ...it, date: move.date } : it)),
  );
  const [, startTransition] = useTransition();
  const [overDay, setOverDay] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function drop(id: string, date: string) {
    const item = optimisticItems.find((it) => it.id === id);
    if (!item || item.date === date) return;
    setError(null);
    startTransition(async () => {
      moveItem({ id, date });
      const res = await setPublishDate(id, date);
      // Bei Fehler fällt die Karte automatisch an den alten Tag zurück
      if (!res.ok) setError(`„${item.title}“ konnte nicht verschoben werden: ${res.error}`);
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <div className="grid min-w-[840px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-surface px-2 py-1.5 text-center text-xs text-muted">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const dayItems = optimisticItems.filter((it) => it.date === d.key);
            const isOver = overDay === d.key;
            return (
              <div
                key={d.key}
                data-day={d.key}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                  e.preventDefault(); // ohne das lässt der Browser kein Ablegen zu
                  e.dataTransfer.dropEffect = "move";
                  if (overDay !== d.key) setOverDay(d.key);
                }}
                onDragLeave={(e) => {
                  // nur zurücksetzen, wenn die Zelle wirklich verlassen wird (nicht beim Wechsel auf eine Karte darin)
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverDay((o) => (o === d.key ? null : o));
                }}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData(DRAG_TYPE);
                  setOverDay(null);
                  if (!id) return;
                  e.preventDefault();
                  drop(id, d.key);
                }}
                className={`min-h-28 space-y-1.5 p-1.5 transition-colors ${d.inMonth ? "bg-surface" : "bg-canvas"}`}
                style={
                  isOver
                    ? {
                        background: "color-mix(in oklab, var(--accent) 14%, var(--surface))",
                        outline: "2px dashed var(--accent)",
                        outlineOffset: -2,
                      }
                    : undefined
                }
              >
                <div className="flex justify-end">
                  <span
                    className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${
                      d.isToday ? "bg-rec font-semibold text-white" : d.inMonth ? "text-text" : "text-muted/60"
                    }`}
                  >
                    {d.day}
                  </span>
                </div>
                {dayItems.map((it) => {
                  const color = statusColor(it.status);
                  return (
                    <Link
                      key={it.id}
                      href={it.href}
                      scroll={false}
                      draggable={it.canMove}
                      onDragStart={(e) => {
                        if (!it.canMove) return;
                        e.dataTransfer.setData(DRAG_TYPE, it.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(it.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverDay(null);
                      }}
                      title={it.canMove ? "Ziehen, um das Datum zu ändern" : undefined}
                      className={`block space-y-1 rounded-md border-l-2 p-1.5 text-xs transition-opacity ${
                        it.canMove ? "cursor-grab active:cursor-grabbing" : ""
                      } ${draggingId === it.id ? "opacity-40" : ""}`}
                      style={{ background: `color-mix(in oklab, ${color} 12%, var(--raised))`, borderColor: color }}
                    >
                      <p className="truncate font-medium">{it.title}</p>
                      {showClient && <p className="truncate text-muted">{it.customerName}</p>}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <FormatTag format={it.format} />
                        <StatusBadge status={it.status} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
