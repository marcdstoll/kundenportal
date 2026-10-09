"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type NavItem = { href: string; label: string; color?: string };

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
    <nav className="flex gap-0.5 overflow-x-auto md:flex-col">
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
            {item.color && <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />}
            <span className="flex-1">{item.label}</span>
            <LinkPending />
          </Link>
        );
      })}
    </nav>
  );
}
