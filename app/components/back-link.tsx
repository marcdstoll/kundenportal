"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// „Zurück“: zur vorherigen Seite (z. B. dem geöffneten Projekt), sonst zu fallback
export function BackLink({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      className="text-sm text-accent hover:underline"
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      ← Zurück
    </Link>
  );
}
