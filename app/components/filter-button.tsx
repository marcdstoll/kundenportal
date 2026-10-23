"use client";

import { useTransition, type ButtonHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { saveViewFilter } from "@/app/filter-actions";
import type { FilterView } from "@/lib/view-filters";

// Knopf, der einen Filter der Ansicht für den Nutzer speichert; die Seite lädt danach gefiltert neu.
// Sieht aus wie die bisherigen Filter-Links (Klassen kommen von außen).
// Mit href: erst speichern, dann zu dieser Seite wechseln (z. B. „Projekte“ eines Kunden).
export function FilterButton({
  view,
  patch,
  href,
  className = "",
  children,
  ...rest
}: { view: FilterView; patch: Record<string, string>; href?: string } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "type"
>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      {...rest}
      aria-busy={pending || undefined}
      onClick={() =>
        startTransition(async () => {
          await saveViewFilter(view, patch);
          if (href) router.push(href);
        })
      }
      className={`cursor-pointer ${className} ${pending ? "opacity-60" : ""}`}
    >
      {children}
    </button>
  );
}
