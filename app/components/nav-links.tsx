"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const [path, query] = item.href.split("?");
        const itemAs = query ? new URLSearchParams(query).get("as") : null;
        const samePath = pathname === path || pathname.startsWith(path + "/");
        const active = samePath && (itemAs ?? null) === (as ?? null);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              active ? "bg-raised font-medium text-text" : "text-muted hover:bg-raised/60 hover:text-text"
            }`}
          >
            {item.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- kleines Logo aus der eigenen API
              <img src={item.logo} alt="" className="size-4 shrink-0 rounded-full border border-line bg-white object-cover" />
            ) : (
              item.color && <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
            )}
            <span className="flex-1">{item.label}</span>
            <LinkPending />
            {!!item.badge && (
              <span className="min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 text-white" style={{ background: "var(--rec)" }}>
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
