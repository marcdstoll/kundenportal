// Projekt-Ideen: Status (wie beim Featureboard) und Priorität
export { FEATURE_STATUSES as IDEA_STATUSES, FEATURE_STATUS_LABELS as IDEA_STATUS_LABELS } from "@/lib/features";
export { FEATURE_STATUS_COLORS as IDEA_STATUS_COLORS } from "@/lib/features";

export const PRIORITIES = ["hoch", "mittel", "niedrig"] as const;

export const PRIORITY_LABELS: Record<string, string> = {
  hoch: "Hoch",
  mittel: "Mittel",
  niedrig: "Niedrig",
};

export const PRIORITY_COLORS: Record<string, string> = {
  hoch: "var(--st-in_arbeit)",
  mittel: "var(--st-ready_to_post)",
  niedrig: "var(--st-todo)",
};

// Für die Sortierung: hoch zuerst
export const PRIORITY_RANK: Record<string, number> = { hoch: 0, mittel: 1, niedrig: 2 };
