import Link from "next/link";
import { SignOutButton } from "@/app/dashboard/sign-out-button";
import { listUsers } from "@/lib/queries";
import { Avatar, personHue } from "./ui";
import { NavLinks, type NavItem } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

type Props = {
  user: { name: string; role: string };
  // Admin schaut sich gerade die Ansicht eines Kunden an
  viewAs?: { id: string; name: string } | null;
  activeHref?: string;
  children: React.ReactNode;
};

const ROLE_LABELS: Record<string, string> = {
  kunde: "Client",
  cutter: "Cutter",
  admin: "Admin",
};

function navFor(role: string): NavItem[] {
  if (role === "kunde") {
    return [
      { href: "/kunde", label: "Projekte" },
      { href: "/kalender", label: "Kalender" },
      { href: "/neu", label: "Neues Projekt" },
    ];
  }
  const items: NavItem[] = [
    { href: "/board", label: "Board" },
    { href: "/kalender", label: "Kalender" },
    { href: "/nach-cutter", label: "Nach Cutter" },
    { href: "/nach-clients", label: "Nach Clients" },
    { href: "/cutter", label: "Cutter" },
    { href: "/clients", label: "Clients" },
  ];
  if (role === "admin") items.push({ href: "/neu", label: "Neues Projekt" });
  return items;
}

// Grundgerüst aller Seiten: Seitenleiste links, Inhalt rechts
export async function Shell({ user, viewAs, activeHref, children }: Props) {
  // Admins sehen links alle Kunden und können deren Ansicht öffnen
  const clients = user.role === "admin" ? await listUsers("kunde") : [];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-5 border-b border-line bg-surface p-3 md:sticky md:top-0 md:h-screen md:w-60 md:overflow-y-auto md:border-b-0 md:border-r">
        <Link href="/dashboard" className="flex items-center gap-2 px-2.5 pt-1.5 text-[15px] font-semibold tracking-tight">
          <span className="rec-dot size-2.5 rounded-full bg-rec" aria-hidden />
          Contenthaus
        </Link>

        <NavLinks items={navFor(user.role)} activeHref={viewAs ? "" : activeHref} />

        {clients.length > 0 && (
          <div className="space-y-1">
            <p className="px-2.5 text-xs text-muted">Kundenansicht</p>
            <NavLinks
              activeHref={viewAs ? `/kunde?as=${viewAs.id}` : ""}
              items={clients.map((c) => ({
                href: `/kunde?as=${c.id}`,
                label: c.name,
                color: `hsl(${personHue(c.name)} 65% 55%)`,
              }))}
            />
          </div>
        )}

        <div className="mt-auto space-y-1 border-t border-line pt-3">
          <div className="flex items-center gap-2 px-2.5 pb-1">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1 text-xs">
              <p className="truncate">{user.name}</p>
              <p className="text-muted">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
          </div>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {viewAs && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-6 py-2.5 text-sm md:px-10" style={{ background: "color-mix(in oklab, var(--accent) 12%, transparent)" }}>
            <span>
              Du siehst gerade die Ansicht von <b>{viewAs.name}</b>.
            </span>
            <Link href="/board" className="text-accent hover:underline">
              Zurück zum Board
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-5 pt-8 md:px-10">
      <h1 className="text-[1.75rem] font-semibold tracking-tight">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
