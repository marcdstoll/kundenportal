import Link from "next/link";
import { personColor } from "@/lib/colors";
import type { CustomerLinks } from "@/lib/queries";
import { Avatar } from "./ui";

const LABELS = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram" } as const;

const short = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

// Alle Links in Anzeige-Reihenfolge (feste zuerst), nur ausgefüllte
export function linkRows(links: CustomerLinks) {
  return [
    ...(["tiktok", "youtube", "instagram"] as const).map((k) => ({ label: LABELS[k], url: links[k] })),
    ...links.extra,
  ].filter((l) => l.url);
}

// Titelbild oder – ohne Bild – eine Fläche in der Kundenfarbe mit Logo bzw. Initialen
export function Cover({
  id,
  name,
  coverUrl,
  logoUrl,
  className = "",
}: {
  id: string;
  name: string;
  coverUrl: string | null;
  logoUrl: string | null;
  className?: string;
}) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Bild aus der eigenen API
      <img src={coverUrl} alt="" className={`w-full object-cover ${className}`} />
    );
  }
  const color = personColor(id, name);
  return (
    <div
      className={`flex w-full items-center justify-center ${className}`}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, ${color} 55%, var(--surface)), color-mix(in oklab, ${color} 20%, var(--surface)))`,
      }}
      aria-hidden
    >
      <Avatar name={name} id={id} size="lg" logoUrl={logoUrl} />
    </div>
  );
}

// Karte für die Kunden-Galerie (Admins: /clients, Cutter: /meine-clients)
export function CustomerCard({
  href,
  id,
  name,
  coverUrl,
  logoUrl,
  children,
}: {
  href: string;
  id: string;
  name: string;
  coverUrl: string | null;
  logoUrl: string | null;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-muted/40"
      data-testid="customer-card"
    >
      <Cover id={id} name={name} coverUrl={coverUrl} logoUrl={logoUrl} className="aspect-[16/9]" />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="flex items-center gap-2 font-medium">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: personColor(id, name) }} />
          <span className="truncate group-hover:underline">{name}</span>
        </p>
        {children}
      </div>
    </Link>
  );
}

// Detailansicht eines Kunden (nur lesen): Titelbild, Links, Infos für die Cutter
export function CustomerProfileView({
  customer,
  coverUrl,
  logoUrl,
}: {
  customer: { id: string; name: string; notes: string | null; links: CustomerLinks };
  coverUrl: string | null;
  logoUrl: string | null;
}) {
  const rows = linkRows(customer.links);
  return (
    <article className="space-y-6" data-testid="customer-profile">
      <Cover
        id={customer.id}
        name={customer.name}
        coverUrl={coverUrl}
        logoUrl={logoUrl}
        className="aspect-[16/7] rounded-xl border border-line"
      />
      <header className="flex items-center gap-3">
        <Avatar name={customer.name} id={customer.id} size="md" logoUrl={logoUrl} />
        <h2 className="text-2xl font-semibold tracking-tight">{customer.name}</h2>
      </header>
      {rows.length > 0 && (
        <dl className="divide-y divide-line rounded-xl border border-line text-sm" data-testid="customer-links">
          {rows.map((l, i) => (
            <div
              key={`${l.label}-${i}`}
              className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5 sm:grid-cols-[10rem_1fr]"
            >
              <dt className="text-muted">{l.label}</dt>
              <dd className="min-w-0 truncate">
                <a href={l.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {short(l.url)}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Infos für die Cutter</h3>
        {customer.notes ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{customer.notes}</p>
        ) : (
          <p className="text-sm text-muted">Noch keine Infos hinterlegt.</p>
        )}
      </section>
    </article>
  );
}
