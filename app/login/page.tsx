"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

// Fehlermeldungen von Better Auth auf Deutsch
function translate(message?: string) {
  if (!message) return "Etwas ist schiefgelaufen.";
  if (/invalid email or password/i.test(message)) return "E-Mail oder Passwort ist falsch.";
  if (/too many/i.test(message)) return "Zu viele Versuche – bitte kurz warten.";
  return message;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (result.error) {
      setError(translate(result.error.message));
      return;
    }
    // Bewusst komplett neu laden: nichts vom vorherigen Nutzer bleibt im Browser-Zwischenspeicher
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/dashboard");
  }

  const field = "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm placeholder:text-muted/70";

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6">
                <img src="lightLogo.png" className="logo-on-light h-8 w-auto"/>
          <img src="darkLogo.png" className="logo-on-dark h-8 w-auto"/>

        <h1 className="text-xl font-semibold tracking-tight">Anmelden</h1>
        <input
          type="email"
          autoComplete="email"
          className={field}
          placeholder="E-Mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          autoComplete="current-password"
          className={field}
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          disabled={loading}
          className="w-full rounded-md bg-accent py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "Bitte warten…" : "Anmelden"}
        </button>
        <p className="text-center text-xs text-muted">
          Noch kein Zugang oder Passwort vergessen? Melde dich bei uns – du bekommst einen Link per E-Mail.
        </p>
      </form>
    </main>
  );
}
