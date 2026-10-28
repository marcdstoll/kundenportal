// Deadline-Hinweise: 2 Tage vorher (und bei Überschreitung) erscheint ein roter Hinweis.
// Projekte: Deadline = Veröffentlichungsdatum; kein Hinweis mehr ab „Ready to post“/„Online“ (und bei Entwurf/Storno).
// ToDos: eigene Deadline; kein Hinweis mehr, sobald abgeschlossen.
// Gerechnet wird in Kalendertagen nach Wiener Zeit.

export const DEADLINE_WARN_DAYS = 2;
export const JOB_STATUSES_WITHOUT_DEADLINE = ["entwurf", "ready_to_post", "online", "storniert"];

export function todayVienna(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Kalendertage von heute bis zum Datum (negativ = überschritten)
export function daysUntil(isoDate: string, today = todayVienna()) {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function deadlineLabel(days: number) {
  if (days < 0) return days === -1 ? "Deadline gestern" : `Deadline vor ${-days} Tagen`;
  if (days === 0) return "Deadline heute";
  if (days === 1) return "Deadline morgen";
  return `Deadline in ${days} Tagen`;
}

// Hinweis anzeigen? Liefert Text oder null
export function jobDeadlineWarning(publishDate: string | null, status: string, today = todayVienna()) {
  if (!publishDate || JOB_STATUSES_WITHOUT_DEADLINE.includes(status)) return null;
  const days = daysUntil(publishDate, today);
  return days <= DEADLINE_WARN_DAYS ? deadlineLabel(days) : null;
}

export function todoDeadlineWarning(deadline: string | null, status: string, today = todayVienna()) {
  if (!deadline || status !== "offen") return null;
  const days = daysUntil(deadline, today);
  return days <= DEADLINE_WARN_DAYS ? deadlineLabel(days) : null;
}
