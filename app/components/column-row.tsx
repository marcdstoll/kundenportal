"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Column = { id: string; header: React.ReactNode; body: React.ReactNode; style?: React.CSSProperties };

const DRAG_TYPE = "application/x-board-column";
const COOKIE = "board_columns";

// Reihenfolge ein Jahr lang im Browser merken
function saveOrder(order: string[]) {
  document.cookie = `${COOKIE}=${order.join(",")}; path=/; max-age=31536000; samesite=lax`;
}

// Reihe von Board-Spalten, die sich an der Überschrift per Drag & Drop umordnen lassen.
// Die Reihenfolge landet in einem Cookie, damit der Server sie beim nächsten Laden schon kennt.
export function ColumnRow({ order, 
  columns,canReorder = false}: { order: string[]; columns: Column[]; canReorder?: boolean; }) {
  const router = useRouter();
  const [current, setCurrent] = useState(order);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  function drop(targetId: string, draggedId: string) {
    if (!draggedId || draggedId === targetId) return;
    // An die Stelle der Zielspalte setzen: nach links davor, nach rechts dahinter
    const targetIndex = current.indexOf(targetId);
    const next = current.filter((id) => id !== draggedId);
    next.splice(targetIndex, 0, draggedId);
    setCurrent(next); // sofort umsortieren
    saveOrder(next);
    router.refresh(); // andere Board-Gruppen übernehmen die Reihenfolge
  }

  const byId = new Map(columns.map((c) => [c.id, c]));

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:snap-none sm:px-0">
      {current
        .map((id) => byId.get(id))
        .filter((c): c is Column => !!c)
        .map((col) => (
          <section
            key={col.id}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) return; // Karten/Links ignorieren
              e.preventDefault();
              setOver(col.id);
            }}
            onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
            onDrop={(e) => {
              const id = e.dataTransfer.getData(DRAG_TYPE);
              setOver(null);
              if (id) {
                e.preventDefault();
                drop(col.id, id);
              }
            }}
            className={`flex min-w-[80vw] flex-1 basis-0 snap-start flex-col gap-2 rounded-xl p-2 sm:min-w-[13rem] transition-[opacity,box-shadow] ${
              dragging === col.id ? "opacity-40" : ""
            } ${over === col.id && dragging !== col.id ? "ring-2 ring-accent/60" : ""}`}
            style={col.style}
          >
            <div
              draggable={canReorder}
              onDragStart={(e) => {
                if(!canReorder) return;
                e.dataTransfer.setData(DRAG_TYPE, col.id);
                e.dataTransfer.effectAllowed = "move";
                setDragging(col.id);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              className="group/handle flex cursor-grab items-center gap-1 active:cursor-grabbing"
              title="Ziehen, um die Spalte zu verschieben"
            >
              {col.header}
              {canReorder && (
              <span
                aria-hidden
                className="ml-auto px-1 text-muted/50 opacity-0 transition-opacity group-hover/handle:opacity-100"
              >
                ⋮⋮
              </span>
              )}

            </div>
            {col.body}
          </section>
        ))}
    </div>
  );
}
