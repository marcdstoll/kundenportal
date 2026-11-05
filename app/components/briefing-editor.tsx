"use client";

// Briefing im Projekt-Panel – mit „Bearbeiten“ für Admins und den Cutter, der das Projekt angelegt hat
// (Titel, Plattformen, Videolänge, Inhalt, Besonderheiten, Material-Link; in jedem Status).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateJobDetails, type JobDetailsInput } from "@/app/actions";
import { PLATFORMS, VIDEO_LENGTHS } from "@/lib/status";
import { MultiSelect } from "./multi-select";
import { FormatField } from "./format-field";
import { buttonPrimary, buttonSecondary, inputField } from "./ui";

export function BriefingEditor({
  jobId,
  format,
  initial,
  canEdit,
  children,
}: {
  jobId: string;
  format: string;
  initial: JobDetailsInput;
  canEdit: boolean;
  children: React.ReactNode; // Lesansicht
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lengths = VIDEO_LENGTHS[format] ?? [];
  const set = (k: keyof JobDetailsInput, value: string) => setV((x) => ({ ...x, [k]: value }));

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Briefing</h3>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setV(initial);
              setError(null);
              setEditing(true);
            }}
            className="rounded-md px-2 py-0.5 text-xs text-muted hover:bg-raised hover:text-text"
          >
            Bearbeiten
          </button>
        )}
      </div>
      {!editing ? (
        children
      ) : (
        <form
          aria-label="Briefing bearbeiten"
          className="space-y-3 rounded-lg border border-line bg-canvas/40 p-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setError(null);
              const res = await updateJobDetails(jobId, v);
              if (!res.ok) return setError(res.error);
              setEditing(false);
              router.refresh();
            });
          }}
        >
          <label className="block space-y-1">
            <span className="text-muted">Titel</span>
            <input className={inputField} value={v.title} maxLength={200} onChange={(e) => set("title", e.target.value)} disabled={pending} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-muted">Plattformen</span>
              <MultiSelect
                label="Plattformen"
                options={PLATFORMS}
                value={v.platforms}
                onChange={(next) => setV((x) => ({ ...x, platforms: next }))}
                placeholder="Plattformen wählen …"
                disabled={pending}
              />
            </div>
            {lengths.length > 0 && (
              <label className="block space-y-1">
                <span className="text-muted">Videolänge</span>
                <select
                  className={inputField}
                  value={v.videoLength}
                  onChange={(e) => set("videoLength", e.target.value)}
                  disabled={pending}
                >
                  <option value="">Länge wählen …</option>
                  {lengths.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label className="block space-y-1">
            <span className="text-muted">Inhalt</span>
            <FormatField>
              <textarea
                className={inputField}
                rows={4}
                value={v.content}
                onChange={(e) => set("content", e.target.value)}
                disabled={pending}
              />
            </FormatField>
          </label>
          <label className="block space-y-1">
            <span className="text-muted">Besonderheiten</span>
            <FormatField>
              <textarea
                className={inputField}
                rows={3}
                value={v.specialNotes}
                onChange={(e) => set("specialNotes", e.target.value)}
                disabled={pending}
              />
            </FormatField>
          </label>
          <label className="block space-y-1">
            <span className="text-muted">Material-Link (optional)</span>
            <input
              className={inputField}
              value={v.materialLink}
              placeholder="https://f.io/…"
              onChange={(e) => set("materialLink", e.target.value)}
              disabled={pending}
            />
          </label>
          {error && <p className="text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className={buttonPrimary} disabled={pending}>
              {pending ? "Speichert …" : "Speichern"}
            </button>
            <button type="button" className={buttonSecondary} disabled={pending} onClick={() => setEditing(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
