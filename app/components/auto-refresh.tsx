"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { uploadsBusy } from "@/lib/upload-manager";

// Lädt die Daten der Seite regelmäßig neu, damit neue Aufträge automatisch erscheinen.
// Pausiert, solange das Gerät offline ist oder ein Upload läuft: Scheitert das Neuladen, lädt Next.js
// sonst die ganze Seite neu – und ein laufender Upload wäre weg.
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (navigator.onLine === false || uploadsBusy()) return;
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
