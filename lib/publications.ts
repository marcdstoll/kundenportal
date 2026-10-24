// Veröffentlichungs-Links (Hall of Fame): Plattformen und Erkennung der Video-ID aus dem Link.
// Reine Hilfsfunktionen ohne Datenbank – auch im Browser nutzbar.

export const PUBLICATION_PLATFORMS = ["youtube", "tiktok", "instagram"] as const;
export type PublicationPlatform = (typeof PUBLICATION_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<PublicationPlatform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

export const PLATFORM_PLACEHOLDERS: Record<PublicationPlatform, string> = {
  youtube: "youtube.com/shorts/… oder youtu.be/…",
  tiktok: "tiktok.com/@kanal/video/…",
  instagram: "instagram.com/reel/…",
};

// Links lassen sich erst eintragen, wenn das Video fertig ist
export const PUBLICATION_STATUSES = ["ready_to_post", "online"];

// Disziplinen der Rangliste: Shortform + Clipping gemeinsam, Longform getrennt
export const DISCIPLINES = {
  short: { label: "Shortform + Clipping", formats: ["shortform", "clipping"] },
  long: { label: "Longform", formats: ["longform"] },
} as const;
export type Discipline = keyof typeof DISCIPLINES;

export function isDiscipline(v: string | undefined): v is Discipline {
  return v === "short" || v === "long";
}

// Link prüfen und die ID für die Plattform herauslesen. null = kein gültiger Link dieser Plattform.
export function parsePublicationUrl(
  platform: PublicationPlatform,
  raw: string,
): { url: string; externalId: string } | null {
  const text = raw.trim();
  if (!text) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|vm\.|vt\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (platform === "youtube") {
    let id: string | null = null;
    if (host === "youtu.be") id = parts[0] ?? null;
    else if (host === "youtube.com" || host === "music.youtube.com") {
      if (parts[0] === "watch") id = u.searchParams.get("v");
      else if (["shorts", "live", "embed", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { url: u.toString(), externalId: id } : null;
  }

  if (platform === "tiktok") {
    if (host !== "tiktok.com") return null;
    const i = parts.indexOf("video");
    const id = i >= 0 ? parts[i + 1] : null;
    return id && /^\d{8,25}$/.test(id) ? { url: u.toString(), externalId: id } : null;
  }

  // Instagram: /p/<code>, /reel/<code>, /reels/<code>, /tv/<code> (auch mit Kanalnamen davor)
  if (host !== "instagram.com") return null;
  const i = parts.findIndex((x) => ["p", "reel", "reels", "tv"].includes(x));
  const code = i >= 0 ? parts[i + 1] : null;
  return code && /^[A-Za-z0-9_-]{5,40}$/.test(code) ? { url: u.toString(), externalId: code } : null;
}

export function formatViews(n: number) {
  return new Intl.NumberFormat("de-DE").format(Math.round(n));
}
