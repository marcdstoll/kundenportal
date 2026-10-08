"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result =
      mode === "login"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });

    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Etwas ist schiefgelaufen.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6">
        <p className="text-sm font-semibold tracking-tight text-muted">Contenthaus</p>
        <h1 className="text-xl font-semibold tracking-tight">
          {mode === "login" ? "Anmelden" : "Registrieren"}
        </h1>
        {mode === "register" && (
          <input className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm placeholder:text-muted/70" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input type="email" className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm placeholder:text-muted/70" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm placeholder:text-muted/70" placeholder="Passwort (mind. 8 Zeichen)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        {error && <p className="text-sm text-[var(--st-in_arbeit)]">{error}</p>}
        <button disabled={loading} className="w-full rounded-md bg-accent py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40">
          {loading ? "Bitte warten…" : mode === "login" ? "Anmelden" : "Konto erstellen"}
        </button>
        <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="w-full text-sm text-muted hover:text-text">
          {mode === "login" ? "Noch kein Konto? Registrieren" : "Schon registriert? Anmelden"}
        </button>
      </form>
    </main>
  );
}
