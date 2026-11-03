import { FORMATS } from "@/lib/status";

// Multifilter „Kunde × Format“ für Board und Kalender (pro Nutzer gespeichert in profiles.view_filters, Schlüssel m).
//
// Gespeichert werden nur Kunden, die NICHT alle Formate zeigen, als kurze Kürzel – z. B.
//   {"<KundeA>":"sc","<KundeB>":""}  → Kunde A nur Shortform + Clipping, Kunde B ausgeblendet, alle anderen komplett.
// "{}" = alles anzeigen. Neue Kunden erscheinen damit automatisch komplett.
// Gibt es m noch nicht, wird die alte Auswahl übernommen (k = Kunden, f = Formate).

export const ALL_FORMATS = FORMATS.map((f) => f.value as string);
const CODE: Record<string, string> = { shortform: "s", longform: "l", clipping: "c" };

// Kunde → angezeigte Formate (für jeden Kunden der Liste ein Eintrag)
export type FormatMatrix = Record<string, string[]>;

export function decodeMatrix(saved: Record<string, string>, clientIds: string[]): FormatMatrix {
  const matrix: FormatMatrix = Object.fromEntries(clientIds.map((id) => [id, [...ALL_FORMATS]]));
  if (saved.m) {
    try {
      const raw = JSON.parse(saved.m) as Record<string, unknown>;
      for (const id of clientIds) {
        const v = raw[id];
        if (typeof v === "string") matrix[id] = ALL_FORMATS.filter((f) => v.includes(CODE[f]));
      }
      return matrix;
    } catch {
      return matrix; // kaputter Wert → alles anzeigen
    }
  }
  // Alte Filter übernehmen: gewählte Kunden (leer = alle) mit den gewählten Formaten (leer = alle)
  const picked = (saved.k ?? "").split(",").filter((id) => clientIds.includes(id));
  const formats = ALL_FORMATS.filter((f) => (saved.f ?? "").split(",").includes(f));
  const fmts = formats.length ? formats : [...ALL_FORMATS];
  for (const id of clientIds) matrix[id] = picked.length === 0 || picked.includes(id) ? [...fmts] : [];
  return matrix;
}

export function encodeMatrix(matrix: FormatMatrix): string {
  const out: Record<string, string> = {};
  for (const [id, formats] of Object.entries(matrix)) {
    if (formats.length === ALL_FORMATS.length) continue;
    out[id] = ALL_FORMATS.filter((f) => formats.includes(f))
      .map((f) => CODE[f])
      .join("");
  }
  return JSON.stringify(out);
}

// Zeigt der Filter dieses Projekt? Kunden außerhalb der Liste (z. B. bei Cuttern aus zugewiesenen Projekten) immer.
export function matrixShows(matrix: FormatMatrix, job: { customerId: string; format: string }) {
  const formats = matrix[job.customerId];
  return !formats || formats.includes(job.format);
}

export const isUnfiltered = (matrix: FormatMatrix) =>
  Object.values(matrix).every((f) => f.length === ALL_FORMATS.length);
