import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadAssignments, loadPeople, loadPerson, logoUrl } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { buttonSecondary } from "@/app/components/ui";
import { AssignmentSelect, ProfileForm, RegenerateInvite, WelcomeVideoSection, DeleteCustomerButton } from "@/app/components/admin-forms";

// Kundenprofil bearbeiten (nur Admins)
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const [client, cutters, assignments] = await Promise.all([loadPerson(id), loadPeople("cutter"), loadAssignments()]);
  if (!client || client.role !== "kunde") notFound();
  const assigned = new Set(assignments.filter((a) => a.clientId === id).map((a) => a.cutterId));

  return (
    <>
      <PageHeader title={client.name}>
        <Link href={`/nach-clients?c=${id}`} className={buttonSecondary}>
          Projekte
        </Link>
        <Link href={`/kunde?as=${id}`} className={buttonSecondary}>
          Kundenansicht
        </Link>
      </PageHeader>
      <div className="grid max-w-5xl gap-8 px-4 pb-10 sm:px-6 md:px-10 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Profil</h2>
          <p className="text-sm text-muted">
            Login-E-Mail: <span className="text-text">{client.email}</span>
          </p>
          <ProfileForm key={client.logoVersion} person={client} logoUrl={logoUrl(client)} showNotes />
        </section>
        <aside className="space-y-8">
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Betreuende Cutter</h2>
            {cutters.length > 0 ? (
              <AssignmentSelect
                side="client"
                ownerId={id}
                options={cutters.map((c) => ({ value: c.id, label: c.name }))}
                initial={[...assigned]}
                label="Betreuende Cutter"
                placeholder="Cutter auswählen …"
              />
            ) : (
              <p className="text-sm text-muted">Noch keine Cutter angelegt.</p>
            )}
          </section>
          {client.invited && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Persönliches Begrüßungsvideo</h2>
              <WelcomeVideoSection
                userId={id}
                hasVideo={!!client.welcomeVideo?.startsWith("frameio:")}
                version={client.logoVersion}
              />
            </section>
          )}
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Zugang</h2>
            <p className="text-sm text-muted">
              {client.invited ? "Eingeladen – Passwort noch nicht gesetzt." : "Aktiv – Passwort gesetzt."}
            </p>
            <RegenerateInvite userId={id} invited={client.invited} />
          </section>
          <section className="space-y-2">
          <h2 className="text-sm font-medium text-danger">Kunden löschen</h2>
          <DeleteCustomerButton customerId={id} name={client.name} />
        </section>
        </aside>
      </div>
    </>
  );
}
