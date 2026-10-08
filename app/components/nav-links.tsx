"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; color?: string; exact?: boolean };

// Navigation mit Markierung der aktuellen Seite
export function NavLinks({ items, activeHref }: { items: NavItem[]; activeHref?: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-0.5 overflow-x-auto md:flex-col">
      {items.map((item) => {
        const active = activeHref
          ? activeHref === item.href
          : !item.href.includes("?") && (pathname === item.href || pathname.startsWith(item.href + "/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              active ? "bg-raised font-medium text-text" : "text-muted hover:bg-raised/60 hover:text-text"
            }`}
          >
            {item.color && <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
