import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account, invites, profiles, user } from "@/db/schema";
import { onboardingVideoFor } from "@/lib/settings";
import { VideoEmbed } from "@/app/components/video-embed";
import { WelcomePlayer } from "@/app/components/welcome-recorder";
import { AcceptInviteForm } from "./accept-form";
import { InviteSteps } from "./steps";
import { LegalFooter } from "@/app/components/legal-footer";

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
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element -- Logo aus /public, je nach Design hell oder dunkel */}
      <img src="/lightLogo.png" alt="Great Influence" className="logo-on-light h-8 w-auto" />
      {/* eslint-disable-next-line @next/next/no-img-element -- Logo aus /public, je nach Design hell oder dunkel */}
      <img src="/darkLogo.png" alt="Great Influence" className="logo-on-dark h-8 w-auto" />
    </div>
  );

  if (problem || !row) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <div className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6">
          {header}
          <h1 className="text-xl font-semibold tracking-tight">Einladung</h1>
          <p className="text-sm text-muted">{problem}</p>
          <a href="/login" className="inline-block text-sm text-accent hover:underline">
            Zur Anmeldung
          </a>
        </div>
        <LegalFooter />
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
      ? [
          {
            title: "So funktioniert das Portal",
            // Video aus Frame.io im eigenen Player – ältere Einträge können noch ein Link sein
            body: onboarding.startsWith("frameio:") ? (
              <WelcomePlayer
                src={`/api/onboarding/${row.role === "cutter" ? "cutter" : "kunde"}?t=${encodeURIComponent(token)}`}
              />
            ) : (
              <VideoEmbed url={onboarding} title="Onboarding-Video" />
            ),
          },
        ]
      : []),
    { title: isReset ? "Neues Passwort" : "Passwort festlegen", body: passwordStep },
  ];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <div className="w-full max-w-xl space-y-4 rounded-xl border border-line bg-surface p-6">
        {header}
        <h1 className="text-xl font-semibold tracking-tight">
          {isReset ? `Hallo ${first}!` : `Willkommen, ${first}!`}
        </h1>
        <InviteSteps steps={steps} />
      </div>
      <LegalFooter />
    </main>
  );
}
