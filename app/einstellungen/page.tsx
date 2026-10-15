import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SETTING_KEYS, getSetting } from "@/lib/settings";
import { mailInfo } from "@/lib/mail";
import { PageHeader } from "@/app/components/shell";
import { OnboardingForm, TestMailButton } from "./forms";

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
            Neue Nutzer sehen das passende Video, wenn sie ihren Einladungslink öffnen – nach der persönlichen Begrüßung (falls im
            Profil hinterlegt) und bevor sie ihr Passwort festlegen. Links zu YouTube oder Vimeo werden direkt eingebettet.
          </p>
          <OnboardingForm kunde={kunde ?? ""} cutter={cutter ?? ""} />
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">E-Mail-Versand</h2>
          {smtp ? (
            <p className="text-sm">
              Eingerichtet über <span className="font-mono">{smtp}</span>. Einladungen und Passwort-Links werden automatisch per
              Mail verschickt.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Noch nicht eingerichtet. Einladungslinks werden angezeigt, aber nicht verschickt. Zum Einrichten in Coolify die
              Umgebungsvariablen <span className="font-mono">SMTP_HOST</span>, <span className="font-mono">SMTP_PORT</span>,{" "}
              <span className="font-mono">SMTP_USER</span>, <span className="font-mono">SMTP_PASS</span> und{" "}
              <span className="font-mono">MAIL_FROM</span> setzen.
            </p>
          )}
          {smtp && <TestMailButton />}
        </section>
      </div>
    </>
  );
}
