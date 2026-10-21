// Alle Status in Reihenfolge des Ablaufs
export const STATUSES = [
  "todo",
  "warteschlange",
  "in_arbeit",
  "feedback",
  "feedback_client",
  "ready_to_post",
  "online",
  "storniert",
] as const;

export type Status = (typeof STATUSES)[number] | "entwurf";

export const STATUS_LABELS: Record<string, string> = {
  entwurf: "Wird hochgeladen",
  todo: "To Dos",
  warteschlange: "Warteschlange",
  in_arbeit: "Wird jetzt gemacht",
  feedback: "Wartet auf Feedback",
  ready_to_post: "Ready to post",
  online: "Online",
  storniert: "Storniert",
  feedback_client: "Kundenabnahme",
};

// Was die Status bedeuten (für Tooltips)
export const STATUS_HINTS: Record<string, string> = {
  todo: "Offen – kann von einem Cutter reserviert oder gestartet werden",
  warteschlange: "Von einem Cutter reserviert, wird als Nächstes bearbeitet",
  in_arbeit: "Wird gerade geschnitten",
  feedback: "Video ist hochgeladen, Admins geben Feedback",
  ready_to_post: "Freigegeben und bereit zur Veröffentlichung",
  online: "Wurde veröffentlicht",
  storniert: "Wird nicht umgesetzt",
  feedback_client: "Video ist hochgeladen, Kunden geben Feedback",
};

// Farbe je Status als CSS-Variable (siehe globals.css, hell und dunkel)
export function statusColor(status: string) {
  return `var(--st-${STATUSES.includes(status as (typeof STATUSES)[number]) ? status : "todo"})`;
}

// Spalten auf den Boards (Online und Storniert stehen in Kalender und Listen)
export const BOARD_COLUMNS = [
  "todo",
  "warteschlange",
  "in_arbeit",
  "feedback",
  "feedback_client",
  "ready_to_post",
] as const;

// Ab diesen Status sieht der Kunde das fertige Video
export const CUSTOMER_VIDEO_STATUSES = ["feedback_client", "ready_to_post", "online"];

// Ab diesen Status dürfen Kunden das Veröffentlichungsdatum eintragen (nach ihrer Freigabe)
export const CUSTOMER_DATE_STATUSES = ["ready_to_post", "online"];

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

// Videolänge als feste Kategorien je Format (Briefing 02). Grenzen eindeutig: "bis unter" gehört zur nächsten Stufe.
// Clipping hat keine Längenangabe.
export const VIDEO_LENGTHS: Record<string, string[]> = {
  shortform: [
    "Unter 10 Sekunden",
    "10 bis unter 30 Sekunden",
    "30 bis unter 60 Sekunden",
    "60 bis unter 120 Sekunden",
    "120 bis 180 Sekunden",
    "Noch offen",
  ],
  longform: [
    "Unter 5 Minuten",
    "5 bis unter 12 Minuten",
    "12 bis unter 20 Minuten",
    "20 bis unter 30 Minuten",
    "30 bis unter 45 Minuten",
    "45 bis 60 Minuten",
    "Über 60 Minuten",
    "Noch offen",
  ],
  clipping: [],
};

// Auswahl im Formular "Neues Projekt" (mehrere möglich) – hier einfach Einträge ergänzen oder löschen
export const PLATFORMS = ["Instagram", "TikTok", "YouTube", "Sonstiges"];
