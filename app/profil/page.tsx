import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadCustomer, loadPerson, logoUrl } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { Card, ProfileColumn } from "@/app/components/card";
import { ColorPicker } from "@/app/components/color-picker";
import { OwnPasswordButton, PersonForm } from "@/app/components/person-form";

const ROLE_LABELS: Record<string, string> = { kunde: "Client", cutter: "Cutter", admin: "Admin" };

// Mein Profil – gleicher Aufbau wie die Profilseiten von Cuttern und Kunden-Nutzern
export default function ProfilePage() {
  return <Content />;
}

async function Content() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const [person, customer] = await Promise.all([
    loadPerson(me.id),
    me.customerId ? loadCustomer(me.customerId) : Promise.resolve(null),
  ]);
  if (!person) redirect("/login");

  return (
    <>
      <PageHeader title="Mein Profil" />
      <ProfileColumn>
        <Card title="Persönliche Daten" description={ROLE_LABELS[me.role] ?? me.role}>
          <PersonForm key={person.logoVersion} person={person} logoUrl={logoUrl(person)} />
        </Card>
        {customer && (
          <Card title="Kunde">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p>
                <span className="font-medium">{customer.name}</span>
                <span className="text-muted"> · {me.customerAdmin ? "Admin" : "Nutzer"}</span>
              </p>
              <Link href="/team" className="text-accent hover:underline">
                Team ansehen
              </Link>
            </div>
          </Card>
        )}
        <Card
          title="Meine Farbe"
          description={
            me.role === "kunde"
              ? "In dieser Farbe erscheinst du im Portal, z. B. bei Kommentaren. Die Farbe eurer Projekte im Kalender und auf dem Board stellt ein Admin unter „Team“ ein."
              : "In dieser Farbe erscheinst du im Portal, z. B. bei Kommentaren und Projekten."
          }
        >
          <ColorPicker userId={me.id} name={me.name} color={person.color} />
        </Card>
        <Card
          title="Passwort"
          description="Du bekommst einen Link per E-Mail, mit dem du ein neues Passwort festlegst."
        >
          <OwnPasswordButton />
        </Card>
      </ProfileColumn>
    </>
  );
}
