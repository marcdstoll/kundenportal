import { FORMAT_LABELS, STATUS_LABELS, STATUS_STYLES } from "@/lib/status";

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.entwurf;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${style.badge}`}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {label ?? STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function FormatTag({ format }: { format: string }) {
  return (
    <span className="whitespace-nowrap rounded-md border border-line px-1.5 py-0.5 text-xs text-muted">
      {FORMAT_LABELS[format] ?? format}
    </span>
  );
}

// Runde Initialen statt Profilbild
export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  // Farbe aus dem Namen ableiten, damit jede Person immer dieselbe Farbe hat
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const dims = size === "lg" ? "size-14 text-lg" : "size-5 text-[10px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white/90 ${dims}`}
      style={{ background: `hsl(${hue} 35% 38%)` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function Person({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Avatar name={name} />
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
