import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SETTING_KEYS, getSetting } from "@/lib/settings";
import { mailInfo } from "@/lib/mail";
import { PageHeader } from "@/app/components/shell";
import { OnboardingVideo, TestMailButton } from "./forms";

// Einstellungen (nur Admins): Onboarding-Videos und E-Mail-Versand
export default async function SettingsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const [kunde, cutter] = await Promise.all([
    getSetting(SETTING_KEYS.onboardingKunde),
    getSetting(SETTING_KEYS.onboardingCutter),
  ]);
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

        <section className="space-y-3">
          <h2 className="font-medium">E-Mail-Versand</h2>
          <p className="text-sm">{smtp ? "✓ Aktiv" : <span className="text-muted">Nicht eingerichtet</span>}</p>
          {smtp && <TestMailButton defaultTo={me.email} />}
        </section>
      </div>
    </>
  );
}
