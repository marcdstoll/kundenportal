"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Filter, die sich eine Ansicht merkt, wenn man in eine andere wechselt und zurückkommt.
// Gespeichert pro Browser-Tab (sessionStorage); offene Projekte o. Ä. werden bewusst nicht gemerkt.
const REMEMBER: Record<string, string[]> = {
  "/board": ["k", "f"],
  "/kalender": ["k"],
  "/ideen": ["k", "p", "s"],
  "/featureboard": ["s"],
  "/nach-clients": ["c", "s", "d"],
  "/nach-cutter": ["c", "s", "d"],
};
const STORE_KEY = "nav-filter";
const listeners = new Set<() => void>();

function readStore(): string {
  try {
    return sessionStorage.getItem(STORE_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

function remember(path: string, query: string) {
  try {
    const all = JSON.parse(readStore()) as Record<string, string>;
    if ((all[path] ?? "") === query) return;
    all[path] = query;
    sessionStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    return;
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Merkt sich die Filter der aktuellen Ansicht (nicht in der Kundenansicht ?as=)
function useRememberedFilters(): Record<string, string> {
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  useEffect(() => {
    const keys = REMEMBER[pathname];
    if (!keys) return;
    const now = new URLSearchParams(search);
    if (now.has("as")) return;
    const keep = new URLSearchParams();
    for (const k of keys) {
      const v = now.get(k);
      if (v) keep.set(k, v);
    }
    remember(pathname, keep.toString());
  }, [pathname, search]);
  const raw = useSyncExternalStore(subscribe, readStore, () => "{}");
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export type NavItem = { href: string; label: string; color?: string; logo?: string; badge?: number };

// Kleiner pulsierender Punkt, solange die angeklickte Seite lädt
export function LinkPending({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`size-1.5 shrink-0 rounded-full bg-accent transition-opacity duration-150 ${
        pending ? "animate-pulse opacity-100" : "opacity-0"
      } ${className}`}
    />
  );
}

// Navigation mit Markierung der aktuellen Seite.
// Links mit "?as=" (Kundenansicht) gelten nur als aktiv, wenn genau dieser Kunde offen ist.
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const as = useSearchParams().get("as");
  const remembered = useRememberedFilters();

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const [path, query] = item.href.split("?");
        const itemAs = query ? new URLSearchParams(query).get("as") : null;
        const samePath = pathname === path || pathname.startsWith(path + "/");
        const active = samePath && (itemAs ?? null) === (as ?? null);
        const filters = !query ? remembered[path] : "";
        return (
          <Link
            key={item.href}
            href={filters ? `${path}?${filters}` : item.href}
            className={`flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              active ? "bg-raised font-medium text-text" : "text-muted hover:bg-raised/60 hover:text-text"
            }`}
          >
            {item.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- kleines Logo aus der eigenen API
              <img
                src={item.logo}
                alt=""
                className="size-4 shrink-0 rounded-full border border-line bg-white object-cover"
              />
            ) : (
              item.color && <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
            )}
            <span className="flex-1">{item.label}</span>
            <LinkPending />
            {!!item.badge && (
              <span
                className="min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 text-white"
                style={{ background: "var(--rec)" }}
              >
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
