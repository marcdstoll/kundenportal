"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setCustomerBanner } from "@/app/admin-actions";
import { saveViewFilter } from "@/app/filter-actions";
import { shrink } from "@/app/components/customer-forms";
import { ConfirmDialog } from "@/app/components/confirm-dialog";

// ---------- Banner ----------
// Alle sehen das Banner; ändern, verschieben und entfernen können nur Admins (in der Kundenansicht).

const overlayBtn =
  "rounded-md bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/75 disabled:opacity-60";

export function Banner({
  customerId,
  url,
  pos,
  canEdit,
}: {
  customerId: string;
  url: string | null;
  pos: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const file = useRef<HTMLInputElement>(null);
  // Frisch gewähltes Bild – gilt nur, bis die Seite die neue Bild-Version (url) kennt
  const [preview, setPreview] = useState<{ data: string; base: string | null } | null>(null);
  const [moving, setMoving] = useState(false);
  const [draftPos, setDraftPos] = useState(pos);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const drag = useRef<{ y: number; pos: number; overflow: number } | null>(null);

  const src = preview && preview.base === url ? preview.data : url;
  const shownPos = moving ? draftPos : pos;

  const save = (input: { image?: string | null; pos?: number }, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const res = await setCustomerBanner(customerId, input);
      if (!res.ok) {
        setError(res.error);
        setPreview(null);
        return;
      }
      after?.();
      router.refresh();
    });

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Bitte ein Bild auswählen.");
    try {
      const data = await shrink(f, 2400);
      setPreview({ data, base: url });
      save({ image: data, pos: 50 });
    } catch {
      setError("Das Bild konnte nicht gelesen werden.");
    }
  };

  const fileInput = (
    <input
      ref={file}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="sr-only"
      aria-label="Banner-Bild wählen"
      onChange={(e) => {
        pick(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  if (!src) {
    if (!canEdit) return null;
    return (
      <div className="px-4 pt-4 sm:px-6 md:px-10">
        <button
          type="button"
          onClick={() => file.current?.click()}
          disabled={pending}
          className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-sm text-muted transition-colors hover:border-accent hover:text-text"
        >
          <span>{pending ? "Lädt hoch …" : "＋ Banner hinzufügen"}</span>
        </button>
        {fileInput}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="group relative">
      <div
        ref={frame}
        className={`relative h-36 overflow-hidden bg-raised sm:h-52 md:h-64 ${moving ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
        data-testid="banner"
        onPointerDown={(e) => {
          if (!moving || !frame.current || !img.current) return;
          const box = frame.current.getBoundingClientRect();
          const { naturalWidth: w, naturalHeight: h } = img.current;
          const overflow = w ? (box.width * h) / w - box.height : 0;
          drag.current = { y: e.clientY, pos: draftPos, overflow };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.overflow <= 0) return;
          const next = d.pos - ((e.clientY - d.y) / d.overflow) * 100;
          setDraftPos(Math.round(Math.min(100, Math.max(0, next))));
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Bild aus der eigenen API bzw. lokale Vorschau */}
        <img
          ref={img}
          src={src}
          alt=""
          draggable={false}
          className="size-full select-none object-cover"
          style={{ objectPosition: `50% ${shownPos}%` }}
        />
        {moving && (
          <span className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-md bg-black/55 px-3 py-1.5 text-xs text-white">
            Bild ziehen, um es zu verschieben
          </span>
        )}
      </div>

      {canEdit && (
        <div
          className={`absolute bottom-3 right-4 flex flex-wrap justify-end gap-1.5 sm:right-6 md:right-10 ${
            moving ? "" : "md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100"
          }`}
        >
          {moving ? (
            <>
              <button
                type="button"
                className={overlayBtn}
                disabled={pending}
                onClick={() => save({ pos: draftPos }, () => setMoving(false))}
              >
                {pending ? "Speichert …" : "Position speichern"}
              </button>
              <button type="button" className={overlayBtn} disabled={pending} onClick={() => setMoving(false)}>
                Abbrechen
              </button>
            </>
          ) : (
            <>
              <button type="button" className={overlayBtn} disabled={pending} onClick={() => file.current?.click()}>
                {pending ? "Lädt hoch …" : "Banner ändern"}
              </button>
              <button
                type="button"
                className={overlayBtn}
                disabled={pending}
                onClick={() => {
                  setDraftPos(pos);
                  setMoving(true);
                }}
              >
                Position ändern
              </button>
              <button type="button" className={overlayBtn} disabled={pending} onClick={() => setConfirm(true)}>
                Entfernen
              </button>
            </>
          )}
          {fileInput}
        </div>
      )}
      {error && <p className="px-4 pt-2 text-sm text-danger sm:px-6 md:px-10">{error}</p>}

      <ConfirmDialog
        open={confirm}
        title="Banner entfernen?"
        message="Der Kunde sieht danach kein Banner mehr auf seiner Übersicht."
        confirmLabel="Entfernen"
        busy={pending}
        error={error}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          save({ image: null }, () => {
            setConfirm(false);
            setPreview(null);
          })
        }
      />
    </div>
  );
}

// ---------- Aufklappbare Bereiche (wie Notion-Toggles) ----------
// Welche Bereiche offen sind, merkt sich die Seite pro Nutzer (profiles.view_filters → uebersicht.o).

export type Section = { id: string; title: string; href: string; hrefLabel: string; content: ReactNode };

export function Sections({ sections, initialOpen }: { sections: Section[]; initialOpen: string[] }) {
  const [open, setOpen] = useState<string[]>(initialOpen);
  const toggle = (id: string) => {
    const next = open.includes(id) ? open.filter((x) => x !== id) : [...open, id];
    setOpen(next);
    saveViewFilter("uebersicht", { o: next.join(",") });
  };
  return (
    <div className="divide-y divide-line border-t border-line">
      {sections.map((s) => {
        const isOpen = open.includes(s.id);
        return (
          <section key={s.id} className="py-3" data-testid={`section-${s.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-expanded={isOpen}
                className="-ml-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-lg font-semibold tracking-tight hover:bg-raised/60"
              >
                <span
                  aria-hidden
                  className={`inline-block text-sm text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
                {s.title}
              </button>
              <Link href={s.href} className="text-sm text-muted hover:text-text hover:underline">
                {s.hrefLabel} →
              </Link>
            </div>
            <div hidden={!isOpen} className="pt-3">
              {s.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}
