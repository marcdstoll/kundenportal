import { FORMAT_LABELS, STATUS_LABELS, statusColor } from "@/lib/status";
import { personColor } from "@/lib/colors";

// Farbiger Status-Chip (Farbe kommt aus globals.css, passt sich hell/dunkel an)
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const color = statusColor(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${
        status === "storniert" ? "line-through" : ""
      }`}
      style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {label ?? STATUS_LABELS[status] ?? status}
    </span>
  );
}

export const FORMAT_COLORS: Record<string, string> = {
  shortform: "#4aa8ff",
  longform: "#ff8a4a",
  clipping: "#3dd6c6",
};

export function FormatTag({ format }: { format: string }) {
  const color = FORMAT_COLORS[format] ?? "var(--muted)";
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted">
      <span className="size-2 rounded-[3px]" style={{ background: color }} />
      {FORMAT_LABELS[format] ?? format}
    </span>
  );
}

export { personHue } from "@/lib/colors";

// Logo (falls hinterlegt), sonst runde Initialen in der Personenfarbe (siehe lib/colors.ts)
export function Avatar({
  name,
  id,
  size = "sm",
  logoUrl,
}: {
  name: string;
  id?: string | null;
  size?: "sm" | "md" | "lg";
  logoUrl?: string | null;
}) {
  const dims = size === "lg" ? "size-14 text-lg" : size === "md" ? "size-8 text-xs" : "size-5 text-[10px]";
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- kleine Logos aus der eigenen API, kein Bild-Optimierer nötig
      <img src={logoUrl} alt="" className={`shrink-0 rounded-full border border-line bg-white object-cover ${dims}`} />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const color = personColor(id, name);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${dims}`}
      style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 70%, black))` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function Person({ name, id, logoUrl }: { name: string; id?: string | null; logoUrl?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Avatar name={name} id={id} logoUrl={logoUrl} />
      <span>{name}</span>
    </span>
  );
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="truncate text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
    >
      {children}
    </a>
  );
}

// "https://next.frame.io/project/abc/view/xyz" → "frame.io/…/xyz"
export function shortLink(url: string) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return `${u.hostname.replace(/^(www|next)\./, "")}/…${last.slice(-8)}`;
  } catch {
    return url;
  }
}

export function formatSize(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}

// "2026-10-09" → "9. Okt. 2026"
export function formatDate(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
}

// Zeitpunkt kurz: "15.10., 14:32" (mit Jahr, wenn nicht aktuelles Jahr)
export function formatDateTime(value: Date | string) {
  const d = new Date(value);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

export const buttonPrimary =
  "rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40";
export const buttonSecondary =
  "rounded-md border border-line px-3 py-2 text-sm transition-colors hover:bg-raised disabled:opacity-40";
export const inputField =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 disabled:opacity-60";
