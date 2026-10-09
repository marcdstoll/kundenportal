// Alle Status in Reihenfolge des Ablaufs
export const STATUSES = [
  "todo",
  "in_arbeit",
  "feedback",
  "ready_to_post",
  "online",
  "storniert",
] as const;

export type Status = (typeof STATUSES)[number] | "entwurf";

export const STATUS_LABELS: Record<string, string> = {
  entwurf: "Wird hochgeladen",
  todo: "To Dos",
  in_arbeit: "Wird jetzt gemacht",
  feedback: "Wartet auf Feedback",
  ready_to_post: "Ready to post",
  online: "Online",
  storniert: "Storniert",
};

// Was die Status bedeuten (für Tooltips)
export const STATUS_HINTS: Record<string, string> = {
  todo: "Offen – kann von einem Cutter übernommen werden",
  in_arbeit: "Wird gerade geschnitten",
  feedback: "Video ist hochgeladen, Admins geben in Frame.io Feedback",
  ready_to_post: "Freigegeben und bereit zur Veröffentlichung",
  online: "Wurde veröffentlicht",
  storniert: "Wird nicht umgesetzt",
};

// Farbe je Status als CSS-Variable (siehe globals.css, hell und dunkel)
export function statusColor(status: string) {
  return `var(--st-${STATUSES.includes(status as (typeof STATUSES)[number]) ? status : "todo"})`;
}

// Spalten auf den Boards (Online und Storniert stehen in Kalender und Listen)
export const BOARD_COLUMNS = ["todo", "in_arbeit", "feedback", "ready_to_post"] as const;

// Ab diesen Status sieht der Kunde das fertige Video
export const CUSTOMER_VIDEO_STATUSES = ["ready_to_post", "online"];

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
  "Instagram",
  "TikTok",
  "YouTube",
  "Sonstiges"
];
