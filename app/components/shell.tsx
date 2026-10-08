import Link from "next/link";
import { SignOutButton } from "@/app/dashboard/sign-out-button";
import { Avatar } from "./ui";
import { NavLinks, type NavItem } from "./nav-links";

type Props = {
  user: { name: string; role: string };
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
      { href: "/kunde", label: "Meine Projekte" },
      { href: "/neu", label: "Neues Projekt" },
    ];
  }
  const items: NavItem[] = [
    { href: "/board", label: "Board" },
    { href: "/nach-cutter", label: "Nach Cutter" },
    { href: "/nach-clients", label: "Nach Clients" },
    { href: "/cutter", label: "Cutter" },
    { href: "/clients", label: "Clients" },
  ];
  if (role === "admin") items.push({ href: "/neu", label: "Neues Projekt" });
  return items;
}

// Grundgerüst aller Seiten: Seitenleiste links, Inhalt rechts
export function Shell({ user, children }: Props) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-line bg-surface p-3 md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
        <Link href="/dashboard" className="px-2.5 pt-1 text-sm font-semibold tracking-tight">
          Contenthaus
        </Link>
        <NavLinks items={navFor(user.role)} />
        <div className="mt-auto hidden items-center gap-2 border-t border-line px-1 pt-3 md:flex">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate">{user.name}</p>
            <p className="text-muted">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
        </div>
        <div>
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-4 pt-8 md:px-10">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
