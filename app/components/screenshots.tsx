"use client";

// Screenshots für Featureboard und Projekt-Ideen: im Browser verkleinern (WebP, max. 2000 px), dann hochladen.
// Beliebig viele Bilder pro Eintrag, zusammen höchstens 5 MB (nach dem Verkleinern).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary } from "./ui";
import { MAX_SCREENSHOT_TOTAL } from "@/lib/features";

const MAX_EDGE = 2000; // längste Kante in Pixeln – reicht für gut lesbare Screenshots
const MAX_ORIGINAL = 50 * 1024 * 1024; // noch größere Dateien gar nicht erst einlesen

export type Shot = { name: string; blob: Blob; url: string };

// 1,2 MB bzw. 340 KB bzw. 5 MB
function fmtMB(bytes: number) {
  if (bytes < 100 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(Math.round((bytes / 1024 / 1024) * 10) / 10).toLocaleString("de-DE")} MB`;
}

async function shrinkScreenshot(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  // WebP ist am kleinsten; ältere Browser können es nicht erzeugen → JPEG
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob("image/jpeg");
  if (!jpeg) throw new Error("Bild konnte nicht verarbeitet werden.");
  return jpeg;
}

// Nacheinander an die Upload-Adresse schicken (z. B. /api/features/<id>/images)
export async function uploadScreenshots(uploadUrl: string, shots: Shot[]) {
  for (const shot of shots) {
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": shot.blob.type },
      body: shot.blob,
    });
    if (!res.ok) throw new Error((await res.text()) || "Screenshot konnte nicht gespeichert werden.");
  }
}

export const releaseShots = (shots: Shot[]) => shots.forEach((s) => URL.revokeObjectURL(s.url));

// Auswahl mit kleinen Vorschaubildern und Speicheranzeige (vor dem Absenden)
export function ScreenshotPicker({
  shots,
  onChange,
  used = 0,
  disabled,
  unit = "Vorschlag",
}: {
  shots: Shot[];
  onChange: (shots: Shot[], error: string | null) => void;
  used?: number; // schon gespeicherte Bytes dieses Eintrags
  disabled?: boolean;
  unit?: string; // „Vorschlag“, „Idee“ … für die Meldung
}) {
  const [working, setWorking] = useState(false);
  const total = used + shots.reduce((sum, s) => sum + s.blob.size, 0);
  const full = total >= MAX_SCREENSHOT_TOTAL;

  async function add(files: File[]) {
    if (files.some((f) => !f.type.startsWith("image/")))
      return onChange(shots, "Bitte nur Bilder (PNG, JPG, WebP) auswählen.");
    if (files.some((f) => f.size > MAX_ORIGINAL)) return onChange(shots, "Ein Bild ist zu groß (max. 50 MB).");
    setWorking(true);
    const next = [...shots];
    let sum = total;
    let skipped = 0;
    let broken = 0;
    for (const file of files) {
      try {
        const blob = await shrinkScreenshot(file);
        if (sum + blob.size > MAX_SCREENSHOT_TOTAL) {
          skipped++;
          continue;
        }
        sum += blob.size;
        next.push({ name: file.name, blob, url: URL.createObjectURL(blob) });
      } catch {
        broken++;
      }
    }
    setWorking(false);
    const error = skipped
      ? `Zusammen höchstens ${fmtMB(MAX_SCREENSHOT_TOTAL)} pro ${unit} – ${skipped === 1 ? "ein Bild passt" : `${skipped} Bilder passen`} nicht mehr hinein.`
      : broken
        ? "Ein Bild konnte nicht gelesen werden."
        : null;
    onChange(next, error);
  }

  return (
    <div className="space-y-2">
      {shots.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {shots.map((s, i) => (
            <li key={s.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- lokale Vorschau */}
              <img
                src={s.url}
                alt={s.name}
                title={`${s.name} · ${fmtMB(s.blob.size)}`}
                className="size-16 rounded-md border border-line object-cover"
              />
              <button
                type="button"
                disabled={disabled}
                aria-label={`${s.name} entfernen`}
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-line bg-surface text-xs text-muted hover:text-danger"
                onClick={() => {
                  URL.revokeObjectURL(s.url);
                  onChange(
                    shots.filter((_, j) => j !== i),
                    null,
                  );
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 text-sm text-accent hover:underline ${disabled || working ? "pointer-events-none opacity-50" : ""}`}
        >
          {working ? "Bilder werden verkleinert …" : "+ Screenshots hinzufügen"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="sr-only"
            disabled={disabled || working}
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = "";
              if (picked.length) add(picked);
            }}
          />
        </label>
      )}
      <p className="text-xs text-muted" data-testid="screenshot-usage">
        {total > 0
          ? `${fmtMB(total)} von ${fmtMB(MAX_SCREENSHOT_TOTAL)} belegt.`
          : `Optional – beliebig viele Bilder, zusammen bis ${fmtMB(MAX_SCREENSHOT_TOTAL)}.`}{" "}
        Bilder werden automatisch verkleinert.
      </p>
    </div>
  );
}

// ---------- Screenshots im geöffneten Eintrag nachreichen ----------

export function AddScreenshots({ uploadUrl, used, unit }: { uploadUrl: string; used: number; unit?: string }) {
  const router = useRouter();
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <ScreenshotPicker
        shots={shots}
        used={used}
        unit={unit}
        disabled={busy}
        onChange={(next, err) => {
          setShots(next);
          setError(err);
        }}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      {shots.length > 0 && (
        <button
          type="button"
          className={buttonPrimary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await uploadScreenshots(uploadUrl, shots);
              releaseShots(shots);
              setShots([]);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
            }
            setBusy(false);
            router.refresh();
          }}
        >
          {busy ? "Wird hochgeladen …" : `${shots.length} Screenshot${shots.length === 1 ? "" : "s"} speichern`}
        </button>
      )}
    </div>
  );
}
