import type { SyncResult } from "@/lib/view-sync";
import { formatDateTime } from "@/app/components/ui";

const TRIGGER: Record<string, string> = { cron: "automatisch", manual: "von Hand", link: "Link gespeichert" };

// Kurzbeschreibung eines Views-Abrufs, z. B. „24.10., 00:00 (automatisch) · 12 Links: 10 aktualisiert, 2 …“
export function runSummary(r: SyncResult) {
  const parts = [`${r.updated} aktualisiert`];
  if (r.failed) parts.push(`${r.failed} fehlgeschlagen`);
  if (r.skipped) parts.push(`${r.skipped} TikTok/Instagram noch ohne Abruf`);
  return `${formatDateTime(r.finishedAt)} (${TRIGGER[r.trigger] ?? r.trigger}) · ${r.total} Links: ${parts.join(", ")}`;
}
