"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Lädt die Daten der Seite regelmäßig neu, damit neue Aufträge automatisch erscheinen
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
