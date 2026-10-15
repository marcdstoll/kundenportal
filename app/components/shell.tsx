import Link from "next/link";
import { SignOutButton } from "@/app/dashboard/sign-out-button";
import { clientLogos, listUsers, unreadByJob } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { Avatar, personHue } from "./ui";
import { NavLinks, type NavItem } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { MobileFrame } from "./mobile-frame";

const ROLE_LABELS: Record<string, string> = {
  kunde: "Client",
  cutter: "Cutter",
  admin: "Admin",
};

function navFor(role: string, unread: number): NavItem[] {
  const inbox: NavItem = { href: "/inbox", label: "Inbox", badge: unread };
  if (role === "kunde") {
    return [
      inbox,
      { href: "/kunde", label: "Projekte" },
      { href: "/kalender", label: "Kalender" },
      { href: "/neu", label: "Neues Projekt" },
    ];
  }
  if (role === "cutter") {
    // Cutter: keine Verwaltung, nur die eigene Arbeit und die betreuten Kunden
    return [
      inbox,
      { href: "/board", label: "Board" },
      { href: "/kalender", label: "Kalender" },
      { href: "/nach-cutter", label: "Meine Projekte" },
      { href: "/meine-clients", label: "Meine Clients" },
      { href: "/neu", label: "Neues Projekt" },
    ];
  }
  return [
    inbox,
    { href: "/board", label: "Board" },
    { href: "/kalender", label: "Kalender" },
    { href: "/nach-cutter", label: "Nach Cutter" },
    { href: "/nach-clients", label: "Nach Clients" },
    { href: "/cutter", label: "Cutter" },
    { href: "/clients", label: "Clients" },
    { href: "/neu", label: "Neues Projekt" },
  ];
}

// Inbox-Zähler: darf nie die ganze App lahmlegen (z. B. wenn eine Migration fehlt)
async function safeUnread(userId: string) {
  try {
    return (await unreadByJob(userId)).total;
  } catch (e) {
    console.error("Inbox-Zähler nicht verfügbar:", e);
    return 0;
  }
}

async function safeLogos() {
  try {
    return await clientLogos();
  } catch (e) {
    console.error("Logos nicht verfügbar:", e);
    return new Map<string, string>();
  }
}

// Grundgerüst aller Seiten: Seitenleiste links, Inhalt rechts.
// Sitzt im Root-Layout und bleibt beim Seitenwechsel stehen – nur der Inhalt rechts tauscht.
// Auf dem Handy wird die Seitenleiste zu einer Kopfzeile mit Aufklappmenü (MobileFrame).
export async function AppFrame({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Nicht angemeldet (Login-Seite, Einladung): ohne Seitenleiste
  if (!user) return <>{children}</>;

  // Admins sehen links alle Kunden und können deren Ansicht öffnen
  const [clients, unread, logos] = await Promise.all([
    user.role === "admin" ? listUsers("kunde") : Promise.resolve([]),
    safeUnread(user.id),
    safeLogos(),
  ]);

  const sidebar = (
    <>
      <Link href="/dashboard" className="hidden items-center gap-2 px-2.5 pt-1.5 text-[15px] font-semibold tracking-tight md:flex">
        <span className="rec-dot size-2.5 rounded-full bg-rec" aria-hidden />
        Contenthaus
      </Link>

      <NavLinks items={navFor(user.role, unread)} />

      {clients.length > 0 && (
        <div className="space-y-1">
          <p className="px-2.5 text-xs text-muted">Kundenansicht</p>
          <NavLinks
            items={clients.map((c) => ({
              href: `/kunde?as=${c.id}`,
              label: c.name,
              color: logos.has(c.id) ? undefined : `hsl(${personHue(c.name)} 65% 55%)`,
              logo: logos.get(c.id),
            }))}
          />
        </div>
      )}

      <div className="mt-auto space-y-1 border-t border-line pt-3">
        <div className="flex items-center gap-2 px-2.5 pb-1">
          <Avatar name={user.name} logoUrl={logos.get(user.id)} />
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate">{user.name}</p>
            <p className="text-muted">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
        </div>
        <ThemeToggle />
        <SignOutButton />
      </div>
    </>
  );

  return (
    <MobileFrame unread={unread} sidebar={sidebar}>
      {children}
    </MobileFrame>
  );
}

// Hinweis oben, wenn ein Admin gerade die Ansicht eines Kunden offen hat
export function ViewAsBanner({ viewAs }: { viewAs?: { id: string; name: string } | null }) {
  if (!viewAs) return null;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-6 py-2.5 text-sm md:px-10"
      style={{ background: "color-mix(in oklab, var(--accent) 12%, transparent)" }}
    >
      <span>
        Du siehst gerade die Ansicht von <b>{viewAs.name}</b>.
      </span>
      <Link href="/board" className="text-accent hover:underline">
        Zurück zum Board
      </Link>
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-5 pt-6 sm:px-6 sm:pt-8 md:px-10">
      <h1 className="text-[1.75rem] font-semibold tracking-tight">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
