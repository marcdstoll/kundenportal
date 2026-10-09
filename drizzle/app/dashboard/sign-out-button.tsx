"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <button
      className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-muted transition-colors hover:bg-raised/60 hover:text-text"
      onClick={async () => {
        await authClient.signOut();
        // Neu laden, damit die Seitenleiste verschwindet
        // Bewusst komplett neu laden: nichts vom vorherigen Nutzer bleibt im Browser-Zwischenspeicher
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login");
      }}
    >
      Abmelden
    </button>
  );
}
