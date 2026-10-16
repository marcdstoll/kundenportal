"use client";

import { useState } from "react";
import Link from "next/link";

// Seitenleiste auf dem Desktop, Kopfzeile + Aufklappmenü auf dem Handy.
// Klick auf einen Link im Menü schließt es wieder.
export function MobileFrame({
  inbox,
  sidebar,
  children,
}: {
  inbox: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Kopfzeile nur auf schmalen Bildschirmen */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="rec-dot size-2.5 rounded-full bg-rec" aria-hidden />
          Contenthaus
        </Link>
        <div className="flex items-center gap-1">
          {inbox}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Menü schließen" : "Menü öffnen"}
            className="rounded-md px-2.5 py-1.5 text-lg leading-none hover:bg-raised"
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </header>

      {/* Seitenleiste: Desktop immer sichtbar, Handy als Menü unter der Kopfzeile */}
      <aside
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, button[data-close]")) setOpen(false);
        }}
        className={`${open ? "fixed inset-x-0 bottom-0 top-[49px] z-30 flex overflow-y-auto" : "hidden"} flex-col gap-5 bg-surface p-3 md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:overflow-y-auto md:border-r md:border-line`}
      >
        {sidebar}
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
