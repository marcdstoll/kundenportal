"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePublications } from "@/app/hall-of-fame-actions";
import {
  PLATFORM_LABELS,
  PLATFORM_PLACEHOLDERS,
  PUBLICATION_PLATFORMS,
  formatViews,
  type PublicationPlatform,
} from "@/lib/publications";
import { buttonSecondary, formatDateTime, inputField } from "./ui";

export type PublicationView = {
  platform: PublicationPlatform;
  url: string;
  views: number | null;
  viewsAt: string | null;
  lastError: string | null;
};

// Veröffentlichungs-Links eines Videos (Hall of Fame): je Plattform ein Link, darunter der letzte Views-Stand
export function PublicationsForm({ jobId, publications }: { jobId: string; publications: PublicationView[] }) {
  const router = useRouter();
  const initial = Object.fromEntries(
    PUBLICATION_PLATFORMS.map((p) => [p, publications.find((x) => x.platform === p)?.url ?? ""]),
  ) as Record<PublicationPlatform, string>;
  const [links, setLinks] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = PUBLICATION_PLATFORMS.some((p) => links[p].trim() !== initial[p]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await savePublications(jobId, links);
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setMsg({ ok: true, text: "Gespeichert." });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {PUBLICATION_PLATFORMS.map((p) => {
        const pub = publications.find((x) => x.platform === p);
        return (
          <div key={p} className="space-y-1">
            <label className="block text-xs text-muted" htmlFor={`pub-${p}`}>
              {PLATFORM_LABELS[p]}
            </label>
            <input
              id={`pub-${p}`}
              className={inputField}
              placeholder={PLATFORM_PLACEHOLDERS[p]}
              value={links[p]}
              onChange={(e) => {
                setLinks({ ...links, [p]: e.target.value });
                setMsg(null);
              }}
              disabled={busy}
            />
            {pub && links[p].trim() === initial[p] && <PublicationStatus pub={pub} />}
          </div>
        );
      })}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy || !changed} className={buttonSecondary}>
          {busy ? "Speichert …" : "Links speichern"}
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-muted" : "text-danger"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}

function PublicationStatus({ pub }: { pub: PublicationView }) {
  if (pub.views !== null) {
    return (
      <p className="text-xs text-muted" data-testid={`views-${pub.platform}`}>
        <span className="font-medium text-text">{formatViews(pub.views)} Views</span>
        {pub.viewsAt && ` · Stand ${formatDateTime(pub.viewsAt)}`}
        {pub.lastError && <span className="text-danger"> · ⚠ {pub.lastError}</span>}
      </p>
    );
  }
  return (
    <p className={`text-xs ${pub.lastError?.startsWith("Abruf noch nicht") ? "text-muted" : "text-danger"}`}>
      {pub.lastError ?? "Views werden beim nächsten Abruf geholt."}
    </p>
  );
}
