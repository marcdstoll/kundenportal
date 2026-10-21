"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { setPublishDate } from "@/app/actions";
import { FormatTag, StatusBadge } from "./ui";

export type CalendarDay = { key: string; day: number; inMonth: boolean; isToday: boolean };
export type CalendarItem = {
  id: string;
  title: string;
  customerName: string;
  color: string; // Farbe des Kunden (Grundfarbe des Eintrags, unabhängig vom Status)
  format: string;
  status: string;
  date: string; // "YYYY-MM-DD"
  href: string;
  canMove: boolean;
  lockReason: string | null;
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

  // Ziehen sauber beenden: Die gezogene Karte wird beim Ablegen in einen anderen Tag neu aufgebaut,
  // deshalb erreicht ihr eigenes "dragend" React nicht mehr – sie bliebe sonst ausgegraut.
  // Darum hören wir zusätzlich am ganzen Fenster auf das Ende des Ziehens.
  useEffect(() => {
    const reset = () => {
      setDraggingId(null);
      setOverDay(null);
    };
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
    };
  }, []);

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
      {/* Handy: Terminliste statt Monatsraster (Verschieben geht am Computer) */}
      <AgendaList days={days} items={optimisticItems} showClient={showClient} />

      <div className="hidden overflow-x-auto md:block">
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
                  setDraggingId(null);
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
                  const color = it.color;
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
                      title={it.canMove ? "Ziehen, um das Datum zu ändern" : (it.lockReason ?? undefined)}
                      className={`group/item block space-y-1 rounded-md border-l-2 p-1.5 text-xs transition-opacity ${
                        it.canMove ? "cursor-grab active:cursor-grabbing" : ""
                      } ${draggingId === it.id ? "opacity-40" : ""}`}
                      style={{ background: `color-mix(in oklab, ${color} 12%, var(--raised))`, borderColor: color }}
                    >
                      <div className="flex items-start gap-1">
                        <p className="min-w-0 flex-1 truncate font-medium">{it.title}</p>
                        {it.canMove && (
                          <span aria-hidden className="text-muted/60 transition-colors group-hover/item:text-text">
                            ⠿
                          </span>
                        )}
                      </div>
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

// Liste der Tage mit Terminen – für schmale Bildschirme
function AgendaList({ days, items, showClient }: { days: CalendarDay[]; items: CalendarItem[]; showClient: boolean }) {
  const withItems = days.filter((d) => d.inMonth && items.some((it) => it.date === d.key));
  return (
    <div className="space-y-3 md:hidden">
      {withItems.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Keine Termine in diesem Monat.</p>
      )}
      {withItems.map((d) => {
        const date = new Date(`${d.key}T12:00:00`);
        return (
          <section key={d.key} className="space-y-1.5">
            <h3 className={`text-sm font-medium ${d.isToday ? "text-rec" : ""}`}>
              {date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
              {d.isToday && " · heute"}
            </h3>
            {items
              .filter((it) => it.date === d.key)
              .map((it) => {
                const color = it.color;
                return (
                  <Link
                    key={it.id}
                    href={it.href}
                    scroll={false}
                    className="flex items-center justify-between gap-3 rounded-lg border-l-2 p-2.5 text-sm"
                    style={{ background: `color-mix(in oklab, ${color} 12%, var(--raised))`, borderColor: color }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{it.title}</span>
                      {showClient && <span className="block truncate text-xs text-muted">{it.customerName}</span>}
                    </span>
                    <StatusBadge status={it.status} />
                  </Link>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}
