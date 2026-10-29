"use client";

// Anzeige der Upload-Vorgänge aus dem Upload-Manager (lib/upload-manager.ts):
// - UploadTree: in der Seitenleiste unter „Projekt-Upload“, je Vorgang Titel + Prozent (Baumansicht)
// - UploadStatus: alle Dateien eines Vorgangs einzeln (Seite /uploads/[id] und unter dem Formular)

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { discardVorgang, percentOf, retryUpload, uploadStore, useUploads, type Vorgang } from "@/lib/upload-manager";
import { buttonPrimary, buttonSecondary } from "./ui";

function statusLabel(v: Vorgang) {
  if (v.status === "fertig") return "✓";
  if (v.status === "fehler") return "⚠";
  if (v.status === "wartet") return "wartet";
  return `${percentOf(v)} %`;
}

export function UploadTree() {
  const router = useRouter();
  const pathname = usePathname();
  const uploads = useUploads();

  // Fertig hochgeladen → Seite neu laden lassen, damit Projekt bzw. Dateien sofort erscheinen
  useEffect(() => uploadStore.onFinished(() => router.refresh()), [router]);

  if (uploads.length === 0) return null;
  return (
    <div className="space-y-0.5" aria-label="Projekt-Upload">
      <p className="px-2.5 pb-0.5 text-xs text-muted">Projekt-Upload</p>
      <ul>
        {uploads.map((v, i) => {
          const last = i === uploads.length - 1;
          const active = pathname === `/uploads/${v.id}`;
          return (
            <li key={v.id} className="relative pl-6">
              {/* Baumlinien: senkrecht durchgehend, beim letzten Eintrag als abgerundete Ecke */}
              {!last && <span aria-hidden className="absolute bottom-0 left-3.5 top-0 w-px bg-line" />}
              <span
                aria-hidden
                className="absolute left-3.5 top-0 h-1/2 w-2 rounded-bl-md border-b border-l border-line"
              />
              <Link
                href={`/uploads/${v.id}`}
                title={v.error ?? v.notice ?? v.title}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                  active ? "bg-raised font-medium text-text" : "text-muted hover:bg-raised/60 hover:text-text"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{v.title}</span>
                <span
                  className={`shrink-0 text-xs tabular-nums ${
                    v.status === "fehler"
                      ? "text-danger"
                      : v.status === "laeuft" && v.notice
                        ? "font-medium text-[var(--st-ready_to_post)]"
                      : v.status === "fertig"
                        ? "text-[var(--st-online)]"
                        : v.status === "laeuft"
                          ? "font-medium text-text"
                          : ""
                  }`}
                >
                  {statusLabel(v)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Bar({ percent, error }: { percent: number; error?: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-raised">
      <div className={`h-full transition-all ${error ? "bg-danger" : "bg-accent"}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

// Detailansicht eines Vorgangs: Gesamtfortschritt, jede Datei einzeln, bei Fehler „Erneut versuchen“ / „Verwerfen“
export function UploadStatus({ vorgang: v, compact = false }: { vorgang: Vorgang; compact?: boolean }) {
  const percent = percentOf(v);
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-medium">
          {v.title}
          {v.kind === "nachreichen" && <span className="font-normal text-muted"> · Material</span>}
          {v.kind === "review" && <span className="font-normal text-muted"> · Video zur Review</span>}
        </p>
        <span className="shrink-0 text-sm tabular-nums">
          {v.status === "wartet" ? "wartet" : v.status === "fertig" ? "✓ fertig" : `${percent} %`}
        </span>
      </div>
      {v.description && (
        <p
          className={`whitespace-pre-wrap text-sm text-muted ${compact ? "line-clamp-2" : "line-clamp-6"}`}
          data-testid="upload-description"
        >
          {v.description}
        </p>
      )}
      <Bar percent={v.status === "fertig" ? 100 : percent} error={v.status === "fehler"} />
      {v.status === "laeuft" && v.notice && (
        <p className="text-sm text-[var(--st-ready_to_post)]" role="status" data-testid="upload-notice">
          ⏳ {v.notice}
        </p>
      )}

      {v.status === "fehler" && (
        <div className="space-y-2">
          <p className="text-sm text-danger">{v.error}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonPrimary} onClick={() => retryUpload(v.id)}>
              Erneut versuchen
            </button>
            <button type="button" className={buttonSecondary} onClick={() => discardVorgang(v.id)}>
              Verwerfen
            </button>
          </div>
          <p className="text-xs text-muted">
            „Erneut versuchen“ lädt nur, was noch fehlt – angefangene Dateien machen dort weiter, wo sie abgebrochen
            sind. „Verwerfen“ löscht
            {v.kind === "projekt" ? " das unfertige Projekt samt Dateien." : " die unvollständigen Dateien."}
          </p>
        </div>
      )}
      {v.status === "wartet" && (
        <p className="text-xs text-muted">Startet automatisch, sobald der vorherige Upload fertig ist.</p>
      )}

      {!compact && (
        <ul className="space-y-2.5 text-sm">
          {v.files.map((f, i) => {
            const p = f.done ? 100 : f.size ? Math.floor((f.loaded / f.size) * 100) : 0;
            return (
              <li key={i} className="space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-muted tabular-nums">
                    {(f.size / 1024 / 1024).toFixed(1)} MB · {f.done ? "✓" : p > 0 ? `${p} %` : "wartet"}
                  </span>
                </div>
                <Bar percent={p} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Alle laufenden Vorgänge kompakt (z. B. unter dem Formular „Projekt anlegen“); mit jobId/kind nur die passenden
export function UploadOverview({ jobId, kind }: { jobId?: string; kind?: Vorgang["kind"] }) {
  const uploads = useUploads().filter((v) => (!jobId || v.jobId === jobId) && (!kind || v.kind === kind));
  if (uploads.length === 0) return null;
  return (
    <div className="space-y-2">
      {uploads.map((v) => (
        <UploadStatus key={v.id} vorgang={v} compact={!jobId} />
      ))}
    </div>
  );
}
