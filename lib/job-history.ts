// Historie: aufeinanderfolgende Einträge derselben Person zu Dateien („Material nachgereicht“, „Datei gelöscht“)
// werden zu einem aufklappbaren Eintrag zusammengefasst, z. B. „10 Videos nachgereicht · 12.4 GB“.

export type HistoryEntry = {
  id: string;
  action: string;
  detail: string | null;
  at: Date;
  name: string | null;
  actorId: string | null;
};

export type HistoryItem =
  | { kind: "single"; entry: HistoryEntry }
  | { kind: "group"; id: string; action: string; name: string | null; at: Date; entries: HistoryEntry[] };

const GROUPED = new Set(["Material nachgereicht", "Datei gelöscht"]);
const VIDEO = /\.(mp4|mov|m4v|avi|mkv|webm|mxf|wmv|mts|m2ts|3gp|mpg|mpeg|braw|r3d)$/i;

export function groupHistory(entries: HistoryEntry[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  for (const e of entries) {
    const last = items[items.length - 1];
    const prev = last?.kind === "group" ? last.entries[0] : last?.entry;
    if (prev && GROUPED.has(e.action) && prev.action === e.action && prev.actorId === e.actorId) {
      if (last.kind === "group") last.entries.push(e);
      else items[items.length - 1] = { kind: "group", id: prev.id, action: e.action, name: prev.name, at: prev.at, entries: [prev, e] };
      continue;
    }
    items.push({ kind: "single", entry: e });
  }
  return items;
}

// „10 Videos nachgereicht“ / „3 Dateien gelöscht“
export function groupLabel(action: string, names: (string | null)[]) {
  const n = names.length;
  const videos = names.every((x) => x && VIDEO.test(x));
  const noun = videos ? (n === 1 ? "Video" : "Videos") : n === 1 ? "Datei" : "Dateien";
  return `${n} ${noun} ${action === "Datei gelöscht" ? "gelöscht" : "nachgereicht"}`;
}
