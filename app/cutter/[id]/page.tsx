import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listCustomers, activeJobsOnlyWith, loadAssignments, loadPeople, loadPerson, logoUrl } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { ColorPicker } from "@/app/components/color-picker";
import {
  AssignmentSelect,
  DeleteCutterButton,
  ProfileForm,
  RegenerateInvite,
  WelcomeVideoSection,
} from "@/app/components/admin-forms";

// Cutter bearbeiten (nur Admins): Kontakt, freigegebene Kunden, Zugang
export default async function CutterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const [cutter, clients, assignments, activeAlone] = await Promise.all([
    loadPerson(id),
    listCustomers(),
    loadAssignments(),
    activeJobsOnlyWith(id),
  ]);
  if (!cutter || cutter.role === "kunde") notFound();
  const assigned = new Set(assignments.filter((a) => a.cutterId === id).map((a) => a.clientId));

  return (
    <>
      <PageHeader title={cutter.name} />
      <div className="grid max-w-5xl gap-8 px-4 pb-10 sm:px-6 md:px-10 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Profil</h2>
          <p className="text-sm text-muted">
            Login-E-Mail: <span className="text-text">{cutter.email}</span>
          </p>
          <ProfileForm key={cutter.logoVersion} person={cutter} logoUrl={logoUrl(cutter)} showNotes={false} />
        </section>
        <aside className="space-y-8">
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Farbe</h2>
            <p className="text-xs text-muted">
              {cutter.role === "kunde"
                ? "Färbt die Projekte dieses Kunden im Kalender und auf dem Board."
                : "Färbt Avatar und Einträge dieser Person."}
            </p>
            <ColorPicker userId={id} name={cutter.name} color={cutter.color} />
          </section>
          {cutter.role === "cutter" && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Freigegebene Kunden</h2>
              <AssignmentSelect
                side="cutter"
                ownerId={id}
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
                initial={[...assigned]}
                label="Freigegebene Kunden"
                placeholder="Kunden auswählen …"
              />
            </section>
          )}
          {cutter.invited && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Persönliches Begrüßungsvideo</h2>
              <WelcomeVideoSection
                userId={id}
                hasVideo={!!cutter.welcomeVideo?.startsWith("frameio:")}
                version={cutter.logoVersion}
              />
            </section>
          )}
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Zugang</h2>
            <p className="text-sm text-muted">
              {cutter.invited ? "Eingeladen – Passwort noch nicht gesetzt." : "Aktiv – Passwort gesetzt."}
            </p>
            <RegenerateInvite userId={id} invited={cutter.invited} />
          </section>
          {cutter.role === "cutter" && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-danger">Cutter löschen</h2>
              <DeleteCutterButton cutterId={id} name={cutter.name} activeAlone={activeAlone} />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
