"use client";

// Drag & Drop für Upload-Felder: liefert Ereignis-Handler für das Feld und ob gerade etwas darüber gezogen wird.
// Abgelegte Dateien gehen an onFiles – denselben Weg wie „Datei auswählen“ (Prüfung, Upload).
//   const drop = useFileDrop((files) => pick(files), { disabled: busy });
//   <label {...drop.props} className={drop.active ? "ring-2 ring-accent" : ""}>…</label>

import { useRef, useState, type DragEvent } from "react";

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function useFileDrop(onFiles: (files: File[]) => void, opts: { disabled?: boolean; multiple?: boolean } = {}) {
  const [active, setActive] = useState(false);
  const depth = useRef(0); // dragenter/dragleave feuern auch für Kind-Elemente

  const props = {
    "data-dropzone": "",
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      if (!opts.disabled) setActive(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = opts.disabled ? "none" : "copy";
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setActive(false);
      if (opts.disabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(opts.multiple === false ? files.slice(0, 1) : files);
    },
  };
  return { active, props };
}

// Klassen für den hervorgehobenen Zustand (einheitlich an allen Feldern)
export const DROP_ACTIVE = "ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface)] bg-accent/5";
