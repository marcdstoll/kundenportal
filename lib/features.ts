// Featureboard: Status, Farben, Grenzen für Screenshots
export const FEATURE_STATUSES = ["offen", "in_arbeit", "abgeschlossen"] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const FEATURE_STATUS_LABELS: Record<string, string> = {
  offen: "Offen",
  in_arbeit: "Wird jetzt gemacht",
  abgeschlossen: "Abgeschlossen",
};

// Farben aus den vorhandenen Status-Variablen (hell/dunkel automatisch)
export const FEATURE_STATUS_COLORS: Record<string, string> = {
  offen: "var(--st-todo)",
  in_arbeit: "var(--st-warteschlange)",
  abgeschlossen: "var(--st-online)",
};

export const MAX_SCREENSHOTS = 5;
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // gespeichertes Bild (nach dem Verkleinern im Browser)
export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"];

// So heißen Admin-Antworten für alle anderen
export const TEAM_NAME = "Team Great Influence";
