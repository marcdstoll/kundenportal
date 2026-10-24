import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SETTING_KEYS, getSetting, hallOfFameForCutters } from "@/lib/settings";
import { VIEWS_TIMEZONE, lastSyncRun } from "@/lib/view-sync";
import { mailInfo } from "@/lib/mail";
import { PageHeader } from "@/app/components/shell";
import { OnboardingVideo, TestMailButton } from "./forms";
import { CutterVisibilityToggle, ViewSyncButton } from "./hall-of-fame-settings";
import { runSummary } from "@/lib/sync-summary";

// Einstellungen (nur Admins): Onboarding-Videos, E-Mail-Versand, Hall of Fame (Views-Abruf)
export default async function SettingsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const [kunde, cutter, lastRun, hofCutter] = await Promise.all([
    getSetting(SETTING_KEYS.onboardingKunde),
    getSetting(SETTING_KEYS.onboardingCutter),
    lastSyncRun(),
    hallOfFameForCutters(),
  ]);
  const youtubeKey = !!process.env.YOUTUBE_API_KEY;
  const smtp = mailInfo();

  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="max-w-2xl space-y-10 px-4 pb-10 sm:px-6 md:px-10">
        <section className="space-y-3">
          <h2 className="font-medium">Onboarding-Videos</h2>
          <p className="text-sm text-muted">
            Wird neuen Nutzern beim Öffnen des Einladungslinks gezeigt. Die Videos liegen in Frame.io (Ordner
            „Registrierung“) und laufen direkt im Portal.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <OnboardingVideo role="kunde" label="Video für Kunden" value={kunde} />
            <OnboardingVideo role="cutter" label="Video für Cutter" value={cutter} />
          </div>
        </section>

        <section className="space-y-3" aria-label="Hall of Fame">
          <h2 className="font-medium">Hall of Fame</h2>
          <p className="text-sm text-muted">
            Die Views aller hinterlegten Veröffentlichungs-Links werden täglich um 00:00 Uhr abgerufen.
          </p>
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">YouTube</dt>
            <dd>
              {youtubeKey ? "✓ Schlüssel hinterlegt" : <span className="text-danger">YOUTUBE_API_KEY fehlt</span>}
            </dd>
            <dt className="text-muted">TikTok, Instagram</dt>
            <dd className="text-muted">-</dd>
            <dt className="text-muted">Letzter Abruf</dt>
            <dd data-testid="last-sync">
              {lastRun ? (
                <>
                  {runSummary(lastRun)}
                  {lastRun.error && <span className="block text-danger">⚠ {lastRun.error}</span>}
                </>
              ) : (
                <span className="text-muted">Noch keiner</span>
              )}
            </dd>
          </dl>
          <ViewSyncButton />
          <CutterVisibilityToggle on={hofCutter} />
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">E-Mail-Versand</h2>
          <p className="text-sm">{smtp ? "✓ Aktiv" : <span className="text-muted">Nicht eingerichtet</span>}</p>
          {smtp && <TestMailButton defaultTo={me.email} />}
        </section>
      </div>
    </>
  );
}
