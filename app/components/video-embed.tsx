// Zeigt ein Video aus einem Link: YouTube/Vimeo eingebettet, Videodateien im Player, sonst als Button.
export function embedFor(url: string): { kind: "iframe" | "video" | "link"; src: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1);
    if (host.endsWith("youtube.com"))
      id = u.searchParams.get("v") ?? u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/)?.[1] ?? null;
    if (id) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` };
    const vimeo = host.endsWith("vimeo.com") ? u.pathname.match(/\/(\d+)/)?.[1] : null;
    if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo}` };
    if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { kind: "video", src: url };
  } catch {
    // ungültiger Link → einfach als Button anzeigen
  }
  return { kind: "link", src: url };
}

export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const e = embedFor(url);
  if (e.kind === "iframe") {
    return (
      <div className="aspect-video overflow-hidden rounded-lg border border-line bg-black">
        <iframe
          src={e.src}
          title={title}
          className="size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }
  if (e.kind === "video") {
    return <video src={e.src} controls playsInline className="aspect-video w-full rounded-lg border border-line bg-black" />;
  }
  return (
    <a
      href={e.src}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-center gap-2 rounded-lg border border-line bg-raised px-4 py-6 text-sm font-medium hover:bg-raised/70"
    >
      ▶ {title} ansehen
    </a>
  );
}
