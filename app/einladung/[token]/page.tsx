import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account, invites, profiles, user } from "@/db/schema";
import { onboardingVideoFor } from "@/lib/settings";
import { VideoEmbed } from "@/app/components/video-embed";
import { WelcomePlayer } from "@/app/components/welcome-recorder";
import { AcceptInviteForm } from "./accept-form";
import { InviteSteps } from "./steps";

// Öffentliche Seite über den Einladungslink:
// 1. persönliche Begrüßung (falls hinterlegt) → 2. Onboarding-Video (falls hinterlegt) → 3. Passwort festlegen.
// Beim Passwort-Zurücksetzen (Konto existiert schon) gibt es nur Schritt 3.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db
    .select({
      userId: user.id,
      usedAt: invites.usedAt,
      expiresAt: invites.expiresAt,
      name: user.name,
      email: user.email,
      role: user.role,
      welcome: profiles.welcomeVideo,
    })
    .from(invites)
    .innerJoin(user, eq(invites.userId, user.id))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(invites.token, token));

  const problem = !row
    ? "Dieser Link ist ungültig."
    : row.usedAt
      ? "Dieser Link wurde schon benutzt. Du kannst dich ganz normal anmelden."
      : row.expiresAt < new Date()
        ? "Dieser Link ist abgelaufen. Bitte frag nach einem neuen."
        : null;

  const header = (
    <p className="flex items-center gap-2 text-sm font-semibold tracking-tight text-muted">
      <span className="rec-dot size-2 rounded-full bg-rec" aria-hidden />
      Contenthaus
    </p>
  );

  if (problem || !row) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6">
          {header}
          <h1 className="text-xl font-semibold tracking-tight">Einladung</h1>
          <p className="text-sm text-muted">{problem}</p>
          <a href="/login" className="inline-block text-sm text-accent hover:underline">
            Zur Anmeldung
          </a>
        </div>
      </main>
    );
  }

  const [existing] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, row.userId), eq(account.providerId, "credential")));
  const isReset = !!existing;
  const onboarding = isReset ? null : await onboardingVideoFor(row.role ?? "kunde");
  const first = row.name.split(" ")[0];

  const passwordStep = (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {isReset ? "Leg ein neues Passwort fest." : "Leg dein Passwort fest."} Du meldest dich immer mit{" "}
        <b className="text-text">{row.email}</b> an.
      </p>
      <AcceptInviteForm token={token} />
    </div>
  );

  const steps = [
    ...(!isReset && row.welcome
      ? [
          {
            title: "Eine persönliche Begrüßung für dich",
            // Webcam-Aufnahme aus dem Portal (liegt in Frame.io) oder ein hinterlegter Link
            body: row.welcome.startsWith("frameio:") ? (
              <WelcomePlayer src={`/api/welcome/${row.userId}?t=${encodeURIComponent(token)}`} />
            ) : (
              <VideoEmbed url={row.welcome} title="Begrüßung" />
            ),
          },
        ]
      : []),
    ...(onboarding
      ? [{ title: "So funktioniert das Portal", body: <VideoEmbed url={onboarding} title="Onboarding-Video" /> }]
      : []),
    { title: isReset ? "Neues Passwort" : "Passwort festlegen", body: passwordStep },
  ];

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-4 rounded-xl border border-line bg-surface p-6">
        {header}
        <h1 className="text-xl font-semibold tracking-tight">
          {isReset ? `Hallo ${first}!` : `Willkommen, ${first}!`}
        </h1>
        <InviteSteps steps={steps} />
      </div>
    </main>
  );
}
