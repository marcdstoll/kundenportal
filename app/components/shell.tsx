import Link from "next/link";
import { SignOutButton } from "@/app/dashboard/sign-out-button";
import { clientLogos, listCustomers, loadColors, loadInbox, unreadByJob } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { Avatar } from "./ui";
import { colorStyles, personColor } from "@/lib/colors";
import { NavLinks, type NavItem } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { MobileFrame } from "./mobile-frame";
import { InboxButton, type InboxItem } from "./inbox-button";
import { UploadTree } from "./upload-tree";

const ROLE_LABELS: Record<string, string> = {
  kunde: "Client",
  cutter: "Cutter",
  admin: "Admin",
};

// Für alle Rollen gleich, unter der Hauptnavigation: Featureboard, Projekt-Ideen, Projekt anlegen (darunter der Upload-Baum)
function projectNav(featureUnread: number, ideaUnread: number, todoUnread: number): NavItem[] {
  return [
    { href: "/todos", label: "ToDos", badge: todoUnread },
    { href: "/featureboard", label: "Featureboard", badge: featureUnread },
    { href: "/ideen", label: "Projekt-Ideen", badge: ideaUnread },
    { href: "/neu", label: "Projekt-Upload" },
  ];
}

function navFor(role: string): NavItem[] {
  if (role === "kunde") {
    return [
      { href: "/uebersicht", label: "Übersicht" },
      { href: "/kunde", label: "Projekte" },
      { href: "/kalender", label: "Kalender" },
      { href: "/team", label: "Team" },
    ];
  }
  if (role === "cutter") {
    // Cutter: keine Verwaltung, nur die eigene Arbeit und die betreuten Kunden
    return [
      { href: "/board", label: "Board" },
      { href: "/kalender", label: "Kalender" },
      { href: "/nach-cutter", label: "Meine Projekte" },
      { href: "/meine-clients", label: "Meine Clients" },
    ];
  }
  return [
    { href: "/board", label: "Board" },
    { href: "/kalender", label: "Kalender" },
    { href: "/nach-cutter", label: "Nach Cutter" },
    { href: "/nach-clients", label: "Nach Clients" },
    { href: "/cutter", label: "Cutter" },
    { href: "/clients", label: "Clients" },
    { href: "/hall-of-fame", label: "Hall of Fame" },
  ];
}

// Inbox-Zähler: darf nie die ganze App lahmlegen (z. B. wenn eine Migration fehlt)
async function safeUnread(userId: string) {
  try {
    const u = await unreadByJob(userId);
    return { total: u.total, features: u.featureTotal, ideas: u.ideaTotal, todos: u.todoTotal };
  } catch (e) {
    console.error("Inbox-Zähler nicht verfügbar:", e);
    return { total: 0, features: 0, ideas: 0, todos: 0 };
  }
}

// Gewählte Personenfarben als CSS-Variablen (ausfallsicher, z. B. falls die Spalte noch fehlt)
async function safeColors() {
  try {
    return colorStyles(await loadColors());
  } catch (e) {
    console.error("Personenfarben nicht verfügbar:", e);
    return "";
  }
}

// Letzte Meldungen für das Inbox-Fenster (ebenfalls ausfallsicher)
async function safeInbox(userId: string): Promise<InboxItem[]> {
  try {
    const rows = await loadInbox(userId, 30);
    return rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      featureId: r.featureId,
      ideaId: r.ideaId,
      todoId: r.todoId,
      type: r.type,
      text: r.text,
      createdAt: r.createdAt,
      read: !!r.readAt,
      title: r.jobTitle ?? r.featureTitle ?? r.ideaTitle ?? r.todoTitle ?? "",
      jobStatus: r.jobStatus,
    }));
  } catch (e) {
    console.error("Inbox nicht verfügbar:", e);
    return [];
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
  const [clients, unread, logos, inboxItems, colors] = await Promise.all([
    user.role === "admin" ? listCustomers() : Promise.resolve([]),
    safeUnread(user.id),
    safeLogos(),
    safeInbox(user.id),
    safeColors(),
  ]);
  const inbox = (
    <InboxButton
      items={inboxItems}
      unread={unread.total}
      jobHref={user.role === "kunde" ? "/kunde?job=JOBID" : "/board?job=JOBID"}
    />
  );

  const sidebar = (
    <>
      <div className="hidden items-center justify-between gap-2 pl-2.5 pt-1 md:flex">
        <Link href="/dashboard" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          {/*<span className="rec-dot size-2.5 rounded-full bg-rec" aria-hidden /> */}
          <img src="/lightLogo.png" alt="Great Influence" className="logo-on-light h-6 w-auto" />
          <img src="/darkLogo.png" alt="Great Influence" className="logo-on-dark h-6 w-auto" />
        </Link>
        {inbox}
      </div>

      <div className="space-y-0.5">
        <NavLinks items={[...navFor(user.role), ...projectNav(unread.features, unread.ideas, unread.todos)]} />
        <UploadTree />
      </div>

      {clients.length > 0 && (
        <div className="space-y-1">
          <p className="px-2.5 text-xs text-muted">Kundenansicht</p>
          <NavLinks
            items={clients.map((c) => ({
              href: `/uebersicht?as=${c.id}`,
              label: c.name,
              color: logos.has(c.id) ? undefined : personColor(c.id, c.name),
              logo: logos.get(c.id),
            }))}
          />
        </div>
      )}

      <div className="mt-auto space-y-1 border-t border-line pt-3">
        <Link
          href="/profil"
          title="Mein Profil"
          className="flex items-center gap-2 rounded-md px-2.5 py-1 transition-colors hover:bg-raised/60"
        >
          <Avatar name={user.name} id={user.id} logoUrl={logos.get(user.id)} />
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate">{user.name}</p>
            <p className="text-muted">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
        </Link>
        <ThemeToggle />
        {user.role === "admin" && <NavLinks items={[{ href: "/einstellungen", label: "Einstellungen" }]} />}
        <SignOutButton />
        <Link href="/impressum" className="block px-2.5 pt-1 text-xs text-muted hover:text-text hover:underline">
          Impressum
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Gewählte Personenfarben (nur geprüfte Hex-Werte, siehe lib/colors.ts) */}
      {colors && <style dangerouslySetInnerHTML={{ __html: colors }} />}
      <MobileFrame inbox={inbox} sidebar={sidebar}>
        {children}
      </MobileFrame>
    </>
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
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href={`/uebersicht?as=${viewAs.id}`} className="text-accent hover:underline">
          Übersicht
        </Link>
        <Link href={`/kunde?as=${viewAs.id}`} className="text-accent hover:underline">
          Projekte
        </Link>
        <Link href={`/kalender?as=${viewAs.id}`} className="text-accent hover:underline">
          Kalender
        </Link>
        <Link href="/board" className="text-accent hover:underline">
          Zurück zum Board
        </Link>
      </span>
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
