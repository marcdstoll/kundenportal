"use client";

import { useEffect } from "react";

// Fällt eine Datei neben ein Upload-Feld, würde der Browser sie öffnen und die Seite verlassen
// (laufende Uploads wären weg). Außerhalb der Felder (data-dropzone) wird das Ablegen daher abgefangen.
export function DropGuard() {
  useEffect(() => {
    const outside = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files") &&
      !(e.target instanceof Element && e.target.closest("[data-dropzone]"));
    const onOver = (e: DragEvent) => {
      if (!outside(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    const onDrop = (e: DragEvent) => {
      if (outside(e)) e.preventDefault();
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
  return null;
}
