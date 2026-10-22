import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadCustomer, loadPerson, logoUrl } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { Card, ProfileColumn } from "@/app/components/card";
import { ColorPicker } from "@/app/components/color-picker";
import { RegenerateInvite, WelcomeVideoSection } from "@/app/components/admin-forms";
import { PersonForm } from "@/app/components/person-form";

// Ein Nutzer eines Kunden (nur Admins) – gleicher Aufbau wie Cutter-Profil und „Mein Profil“
export default async function MemberPage({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const { id, userId } = await params;
  const [client, person] = await Promise.all([loadCustomer(id), loadPerson(userId)]);
  const member = client?.members.find((m) => m.id === userId);
  if (!client || !member || !person) notFound();

  return (
    <>
      <PageHeader title={person.name}>
        <Link href={`/clients/${id}`} className="text-sm text-accent hover:underline">
          ← {client.name}
        </Link>
      </PageHeader>
      <ProfileColumn>
        <Card title="Persönliche Daten" description={`${member.isAdmin ? "Admin" : "Nutzer"} bei ${client.name}`}>
          <PersonForm key={person.logoVersion} person={person} logoUrl={logoUrl(person)} />
        </Card>
        <Card title="Farbe" description="Färbt Avatar und Kommentare dieser Person.">
          <ColorPicker userId={person.id} name={person.name} color={person.color} />
        </Card>
        {person.invited && (
          <Card title="Persönliches Begrüßungsvideo" description="Wird beim Öffnen der Einladung gezeigt.">
            <WelcomeVideoSection
              userId={person.id}
              hasVideo={!!person.welcomeVideo?.startsWith("frameio:")}
              version={person.logoVersion}
            />
          </Card>
        )}
        <Card
          title="Zugang"
          description={person.invited ? "Eingeladen – Passwort noch nicht gesetzt." : "Aktiv – Passwort gesetzt."}
        >
          <RegenerateInvite userId={person.id} invited={person.invited} />
        </Card>
      </ProfileColumn>
    </>
  );
}
