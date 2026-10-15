import { cookies } from "next/headers";
import { BOARD_COLUMNS, FORMATS } from "@/lib/status";

export const COLUMN_COOKIE = "board_columns";

// Gespeicherte Spaltenreihenfolge des Nutzers (Cookie im Browser).
// Unbekannte Werte fliegen raus, fehlende Spalten werden hinten angehängt –
// so bleibt das Board vollständig, auch wenn später Status dazukommen.
export async function boardColumnOrder(): Promise<string[]> {
  const raw = (await cookies()).get(COLUMN_COOKIE)?.value ?? "";
  const saved = raw.split(",").filter((s) => (BOARD_COLUMNS as readonly string[]).includes(s));
  const unique = [...new Set(saved)];
  return [...unique, ...BOARD_COLUMNS.filter((c) => !unique.includes(c))];
}

// Formatfilter aus der URL lesen: ?f=shortform,clipping  (leer = alle)
export function parseFormatFilter(value: string | string[] | undefined): string[] {
  const all = FORMATS.map((f) => f.value as string);
  const raw = typeof value === "string" ? value.split(",") : [];
  const picked = all.filter((f) => raw.includes(f));
  return picked.length > 0 ? picked : all;
}
