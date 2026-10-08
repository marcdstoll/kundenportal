export const STATUS_LABELS: Record<string, string> = {
  entwurf: "Entwurf",
  todo: "ToDo",
  warteschlange: "Warteschlange",
  in_bearbeitung: "In Bearbeitung",
  feedback: "Feedback",
  abgeschlossen: "Abgeschlossen",
};

// Spalten auf dem Cutter-Board, in dieser Reihenfolge
export const BOARD_COLUMNS = [
  "todo",
  "warteschlange",
  "in_bearbeitung",
  "feedback",
  "abgeschlossen",
] as const;

export const PLATFORMS = [
  "Instagram Reels",
  "TikTok",
  "YouTube",
  "YouTube Shorts",
  "LinkedIn",
  "Sonstiges",
];
