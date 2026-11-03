// Filter, die sich jede Ansicht pro Nutzer merkt (gespeichert in profiles.view_filters).
// Jede Ansicht hat ihre eigenen Werte – der Kalender ist z. B. unabhängig vom Board.
//   k = Kunden (IDs, kommagetrennt), f = Formate, p = Prioritäten, s = Status bzw. Sortierspalte,
//   d = Sortierrichtung bzw. Disziplin (Hall of Fame), c = gewählte Person bzw. Client (Reiter),
//   m = Zuordnung (ToDos: alle / mir zugewiesen / von mir erstellt),
//   o = aufgeklappte Bereiche (Kunden-Übersicht: kalender, projekte),
//   z = Zeitraum (Hall of Fame: all, 7, 30),
//   m = Multifilter Kunde × Format (Board, Kalender – siehe lib/client-format-filter.ts)
export const VIEW_FILTER_KEYS = {
  board: ["k", "f", "m"],
  kalender: ["k", "m"],
  ideen: ["k", "p", "s"],
  featureboard: ["s"],
  "nach-clients": ["c", "s", "d"],
  "nach-cutter": ["c", "s", "d"],
  "hall-of-fame": ["c", "d", "z"],
  todos: ["s", "m"],
  uebersicht: ["o"],
} as const;

export type FilterView = keyof typeof VIEW_FILTER_KEYS;
export type ViewFilters = Record<string, string>;

export function isFilterView(v: string): v is FilterView {
  return Object.hasOwn(VIEW_FILTER_KEYS, v);
}

// Nur erlaubte Schlüssel, nur kurze Texte – alles andere wird verworfen
export function cleanFilters(view: FilterView, input: Record<string, unknown>): ViewFilters {
  const out: ViewFilters = {};
  for (const key of VIEW_FILTER_KEYS[view] as readonly string[]) {
    const v = input[key];
    // Der Multifilter (m) speichert pro Kunde einen Eintrag – dafür mehr Platz
    if (typeof v === "string" && v.length <= (key === "m" ? 50000 : 2000)) out[key] = v;
  }
  return out;
}
