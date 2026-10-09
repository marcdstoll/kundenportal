// Player + Download für das fertige Video. Die Datei kommt direkt von Frame.io,
// der Link wird bei jedem Aufruf frisch und nur nach Rechteprüfung erzeugt.
export function VideoBlock({ fileId, name }: { fileId: string; name: string }) {
  return (
    <div className="space-y-2">
      <video
        controls
        preload="metadata"
        playsInline
        src={`/api/files/${fileId}?mode=play`}
        className="aspect-video w-full rounded-lg border border-line bg-black"
      />
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-muted">{name}</span>
        <a
          href={`/api/files/${fileId}?mode=download`}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 font-medium text-accent-ink transition-opacity hover:opacity-90"
        >
          Herunterladen
        </a>
      </div>
    </div>
  );
}
