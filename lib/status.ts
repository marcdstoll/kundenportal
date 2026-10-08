// Alle Status in Reihenfolge des Ablaufs (wie in Notion)
export const STATUSES = [
  "todo",
  "warteschlange",
  "in_arbeit",
  "feedback",
  "complete",
  "ready_to_post",
  "online",
  "storniert",
] as const;

export type Status = (typeof STATUSES)[number] | "entwurf";

export const STATUS_LABELS: Record<string, string> = {
  entwurf: "Entwurf",
  todo: "To Dos",
  warteschlange: "Warteschlange",
  in_arbeit: "Wird jetzt gemacht",
  feedback: "Wartet auf Feedback",
  complete: "Complete",
  ready_to_post: "Ready to post",
  online: "Online",
  storniert: "Storniert",
};

// Was die Status bedeuten (für Tooltips)
export const STATUS_HINTS: Record<string, string> = {
  todo: "Offen, kann von einem Cutter übernommen werden",
  warteschlange: "Steht an und wird als Nächstes gemacht",
  in_arbeit: "Wird gerade geschnitten",
  feedback: "Cutter wartet auf Freigabe",
  complete: "Fertig, wird noch fürs Posten vorbereitet",
  ready_to_post: "Bereit zur Veröffentlichung",
  online: "Wurde veröffentlicht",
  storniert: "Wird nicht umgesetzt",
};

// Farben je Status (Punkt + Badge). Volle Klassennamen, damit Tailwind sie findet.
export const STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  entwurf: { dot: "bg-zinc-500", badge: "bg-zinc-500/15 text-zinc-300" },
  todo: { dot: "bg-zinc-400", badge: "bg-zinc-400/15 text-zinc-200" },
  warteschlange: { dot: "bg-sky-400", badge: "bg-sky-400/15 text-sky-300" },
  in_arbeit: { dot: "bg-rose-400", badge: "bg-rose-400/15 text-rose-300" },
  feedback: { dot: "bg-violet-400", badge: "bg-violet-400/15 text-violet-300" },
  complete: { dot: "bg-orange-400", badge: "bg-orange-400/15 text-orange-300" },
  ready_to_post: { dot: "bg-amber-300", badge: "bg-amber-300/15 text-amber-200" },
  online: { dot: "bg-emerald-400", badge: "bg-emerald-400/15 text-emerald-300" },
  storniert: { dot: "bg-zinc-600", badge: "bg-zinc-600/20 text-zinc-400 line-through" },
};

// Spalten auf dem Board (Online und Storniert stehen in den Listen)
export const BOARD_COLUMNS = [
  "todo",
  "warteschlange",
  "in_arbeit",
  "feedback",
  "complete",
  "ready_to_post",
] as const;

// Was der Client sieht (einfachere Sprache)
export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  entwurf: "Wird hochgeladen",
  todo: "Eingegangen",
  warteschlange: "Eingeplant",
  in_arbeit: "In Bearbeitung",
  feedback: "In Prüfung",
  complete: "Fertig",
  ready_to_post: "Fertig",
  online: "Online",
  storniert: "Storniert",
};

export const FORMATS = [
  { value: "shortform", label: "Shortform" },
  { value: "longform", label: "Longform" },
  { value: "clipping", label: "Clipping" },
] as const;

export const FORMAT_LABELS: Record<string, string> = {
  shortform: "Shortform",
  longform: "Longform",
  clipping: "Clipping",
};

export const PLATFORMS = [
  "Instagram Reels",
  "TikTok",
  "YouTube",
  "YouTube Shorts",
  "LinkedIn",
  "Sonstiges",
];
