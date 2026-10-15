"use client";

import { useState } from "react";
import { acceptInvite } from "@/app/admin-actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm placeholder:text-muted/70";

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 8) return setError("Mindestens 8 Zeichen.");
        if (pw !== pw2) return setError("Die Passwörter stimmen nicht überein.");
        setBusy(true);
        setError(null);
        const res = await acceptInvite(token, pw);
        if (!res.ok) {
          setBusy(false);
          return setError(res.error);
        }
        // Angemeldet → neu laden, damit die Seitenleiste erscheint
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/dashboard");
      }}
    >
      <input
        type="password"
        autoComplete="new-password"
        className={field}
        placeholder="Neues Passwort (mind. 8 Zeichen)"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        disabled={busy}
      />
      <input
        type="password"
        autoComplete="new-password"
        className={field}
        placeholder="Passwort wiederholen"
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
        disabled={busy}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        disabled={busy}
        className="w-full rounded-md bg-accent py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {busy ? "Einen Moment …" : "Passwort festlegen & loslegen"}
      </button>
    </form>
  );
}
