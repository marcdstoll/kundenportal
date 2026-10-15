import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invites, user } from "@/db/schema";
import { AcceptInviteForm } from "./accept-form";

// Öffentliche Seite: über den Einladungslink das eigene Passwort setzen
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db
    .select({ usedAt: invites.usedAt, expiresAt: invites.expiresAt, name: user.name, email: user.email })
    .from(invites)
    .innerJoin(user, eq(invites.userId, user.id))
    .where(eq(invites.token, token));

  const problem = !row
    ? "Dieser Link ist ungültig."
    : row.usedAt
      ? "Dieser Link wurde schon benutzt. Du kannst dich ganz normal anmelden."
      : row.expiresAt < new Date()
        ? "Dieser Link ist abgelaufen. Bitte frag nach einem neuen."
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6">
        <p className="flex items-center gap-2 text-sm font-semibold tracking-tight text-muted">
          <span className="rec-dot size-2 rounded-full bg-rec" aria-hidden />
          Contenthaus
        </p>
        {problem || !row ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Einladung</h1>
            <p className="text-sm text-muted">{problem}</p>
            <a href="/login" className="inline-block text-sm text-accent hover:underline">
              Zur Anmeldung
            </a>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Willkommen, {row.name}!</h1>
            <p className="text-sm text-muted">
              Leg dein Passwort fest. Danach meldest du dich immer mit <b className="text-text">{row.email}</b> an.
            </p>
            <AcceptInviteForm token={token} />
          </>
        )}
      </div>
    </main>
  );
}
