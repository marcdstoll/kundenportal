import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listCustomers, activeJobsOnlyWith, loadAssignments, loadPerson, logoUrl } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { ColorPicker } from "@/app/components/color-picker";
import { Card, ProfileColumn } from "@/app/components/card";
import { PersonForm } from "@/app/components/person-form";
import {
  AssignmentSelect,
  DeleteCutterButton,
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
      <PageHeader title={cutter.name}>
        <span className="rounded-md bg-raised px-2 py-1 text-xs text-muted">
          {cutter.role === "admin" ? "Admin" : "Cutter"}
        </span>
      </PageHeader>
      <ProfileColumn>
        <Card title="Persönliche Daten">
          <PersonForm key={cutter.logoVersion} person={cutter} logoUrl={logoUrl(cutter)} />
        </Card>
        <Card title="Farbe" description="Färbt Avatar und Einträge dieser Person.">
          <ColorPicker userId={id} name={cutter.name} color={cutter.color} />
        </Card>
        {cutter.role === "cutter" && (
          <Card title="Freigegebene Kunden" description="Der Cutter sieht die Projekte dieser Kunden.">
            <AssignmentSelect
              side="cutter"
              ownerId={id}
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
              initial={[...assigned]}
              label="Freigegebene Kunden"
              placeholder="Kunden auswählen …"
            />
          </Card>
        )}
        {cutter.invited && (
          <Card title="Persönliches Begrüßungsvideo" description="Wird beim Öffnen der Einladung gezeigt.">
            <WelcomeVideoSection
              userId={id}
              hasVideo={!!cutter.welcomeVideo?.startsWith("frameio:")}
              version={cutter.logoVersion}
            />
          </Card>
        )}
        <Card
          title="Zugang"
          description={cutter.invited ? "Eingeladen – Passwort noch nicht gesetzt." : "Aktiv – Passwort gesetzt."}
        >
          <RegenerateInvite userId={id} invited={cutter.invited} />
        </Card>
        {cutter.role === "cutter" && (
          <Card title="Cutter löschen" danger>
            <DeleteCutterButton cutterId={id} name={cutter.name} activeAlone={activeAlone} />
          </Card>
        )}
      </ProfileColumn>
    </>
  );
}
