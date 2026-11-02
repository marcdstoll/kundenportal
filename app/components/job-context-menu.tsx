"use client";

// Rechtsklick-Menü (Schnellzugriff) auf Projektkarten im Board und in den Projektlisten.
// Bietet dieselben Schritte wie das Projekt-Panel (gleiche Begriffe, gleiche Regeln – siehe job-controls.tsx):
//   To Dos: Reservieren / Jetzt starten · Warteschlange: Jetzt starten · Wartet auf Feedback (Admins):
//   Zurück in Warteschlange / An Kunden schicken · Kundenabnahme (Admins): Zurück in Warteschlange / Ready to post ·
//   Ready to post (Admins): Als online markieren · Admins: Projekt löschen (mit Rückfrage).
// Karten bzw. Zeilen kennzeichnen sich mit data-job-id (und data-href, falls sie selbst kein Link sind).
// Auch per Tastatur erreichbar: Kontextmenü-Taste bzw. Umschalt+F10 auf einer fokussierten Karte.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  claimJob,
  clientApprove,
  clientRequestChanges,
  markOnline,
  reserveJob,
  sendBack,
  sendToClient,
  startJob,
  type Result,
} from "@/app/actions";
import { DeleteJobDialog } from "./project-actions";

export type MenuJob = {
  id: string;
  title: string;
  status: string;
  paused: boolean; // Stornierung angefragt → Arbeit ruht
  assigned: boolean; // aktueller Nutzer ist als Cutter eingetragen
};

type Item = { label: string; run?: () => Promise<Result>; open?: true; danger?: true; primary?: true };

function itemsFor(job: MenuJob, isAdmin: boolean): Item[][] {
  const canWork = job.assigned || isAdmin;
  const flow: Item[] = [];
  if (!job.paused) {
    if (job.status === "todo") {
      flow.push({ label: "Reservieren", run: () => reserveJob(job.id) });
      flow.push({ label: "Jetzt starten", run: () => claimJob(job.id), primary: true });
    }
    if (job.status === "warteschlange" && canWork) {
      flow.push({ label: "Jetzt starten", run: () => startJob(job.id), primary: true });
    }
  }
  if (isAdmin) {
    if (job.status === "feedback") {
      flow.push({ label: "Zurück in Warteschlange", run: () => sendBack(job.id) });
      flow.push({ label: "An Kunden schicken", run: () => sendToClient(job.id), primary: true });
    }
    if (job.status === "feedback_client") {
      flow.push({ label: "Zurück in Warteschlange", run: () => clientRequestChanges(job.id, "") });
      flow.push({ label: "Ready to post", run: () => clientApprove(job.id), primary: true });
    }
    if (job.status === "ready_to_post") flow.push({ label: "Als online markieren", run: () => markOnline(job.id) });
  }
  const groups: Item[][] = [[{ label: "Öffnen", open: true }]];
  if (flow.length) groups.push(flow);
  if (isAdmin) groups.push([{ label: "Projekt löschen …", danger: true }]);
  return groups;
}

export function JobContextMenu({
  jobs,
  isAdmin,
  children,
}: {
  jobs: MenuJob[];
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<{ job: MenuJob; href: string | null; x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MenuJob | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const byId = new Map(jobs.map((j) => [j.id, j]));

  // Schließen bei Escape, Scrollen oder Größenänderung
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  // Menü im sichtbaren Bereich halten und den ersten Eintrag fokussieren (Tastatur)
  const place = (el: HTMLDivElement | null) => {
    ref.current = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    if (r.right > vw - 8) el.style.left = `${Math.max(8, vw - 8 - r.width)}px`;
    if (r.bottom > vh - 8) el.style.top = `${Math.max(8, vh - 8 - r.height)}px`;
    el.querySelector<HTMLButtonElement>("button[role=menuitem]")?.focus();
  };

  const onContextMenu = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-job-id]");
    const job = el ? byId.get(el.dataset.jobId!) : undefined;
    if (!el || !job) return; // normales Browser-Menü
    e.preventDefault();
    setError(null);
    let x = e.clientX;
    let y = e.clientY;
    if (x === 0 && y === 0) {
      // per Tastatur geöffnet → an der Karte ausrichten
      const r = el.getBoundingClientRect();
      x = r.left + 12;
      y = r.top + 12;
    }
    setMenu({ job, href: el.dataset.href ?? el.getAttribute("href"), x, y });
  };

  const choose = (item: Item) => {
    if (!menu) return;
    const { job, href } = menu;
    if (item.open) {
      setMenu(null);
      if (href) router.push(href, { scroll: false });
      return;
    }
    if (item.danger) {
      setMenu(null);
      setToDelete(job);
      return;
    }
    if (!item.run) return;
    startTransition(async () => {
      setError(null);
      const res = await item.run!();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMenu(null);
      router.refresh();
    });
  };

  // Pfeiltasten im Menü
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div onContextMenu={onContextMenu}>
      {children}

      {menu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            ref={place}
            role="menu"
            aria-label={`Aktionen für „${menu.job.title}“`}
            onKeyDown={onMenuKey}
            className="fixed z-50 w-60 overflow-hidden rounded-lg border border-line bg-surface py-1 text-sm shadow-2xl"
            style={{ left: menu.x, top: menu.y }}
            data-testid="job-context-menu"
          >
            <p className="truncate px-3 pb-1.5 pt-1 text-xs text-muted">{menu.job.title}</p>
            {menu.job.paused && (
              <p className="px-3 pb-1.5 text-xs text-danger">⏸ Storno angefragt – Arbeit ruht</p>
            )}
            {itemsFor(menu.job, isAdmin).map((group, gi) => (
              <div key={gi} className="border-t border-line py-1">
                {group.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() => choose(item)}
                    className={`block w-full px-3 py-1.5 text-left transition-colors hover:bg-raised focus:bg-raised focus:outline-none disabled:opacity-50 ${
                      item.danger ? "text-danger" : item.primary ? "font-medium text-text" : "text-text"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
            {error && <p className="border-t border-line px-3 py-2 text-xs text-danger">{error}</p>}
          </div>
        </>
      )}

      {toDelete && (
        <DeleteJobDialog
          open
          jobId={toDelete.id}
          title={toDelete.title}
          onCancel={() => setToDelete(null)}
          onDeleted={() => {
            const id = toDelete.id;
            setToDelete(null);
            // War das Projekt gerade im Panel offen → Panel schließen
            const url = new URL(window.location.href);
            if (url.searchParams.get("job") === id) {
              url.searchParams.delete("job");
              router.push(url.pathname + url.search, { scroll: false });
            } else {
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}
