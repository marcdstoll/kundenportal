import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadCustomer } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { MembersPanel } from "@/app/components/customer-forms";
import { ColorPicker } from "@/app/components/color-picker";
import { buttonSecondary } from "@/app/components/ui";

// Team eines Kunden: alle sehen, wer dazugehört. Admins des Kunden laden ein, ernennen Admins, entfernen Nutzer.
export default async function TeamPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "kunde") redirect("/clients");
  const customer = me.customerId ? await loadCustomer(me.customerId) : null;
  if (!customer) redirect("/kunde");

  return (
    <>
      <PageHeader title={`Team ${customer.name}`}>
        <Link href={`/kundenprofil/${customer.id}`} className={buttonSecondary}>
          Unser Profil
        </Link>
      </PageHeader>
      <div className="max-w-3xl space-y-8 px-4 pb-10 sm:px-6 md:px-10">
        <section className="space-y-2">
          <p className="text-sm text-muted">
            {me.customerAdmin
              ? "Als Admin kannst du weitere Personen einladen, Admins ernennen und Zugänge entfernen. Alle Nutzer sehen eure Projekte."
              : "Diese Personen haben Zugang zu euren Projekten. Neue Nutzer lädt ein Admin ein."}
          </p>
          <MembersPanel customerId={customer.id} members={customer.members} canManage={me.customerAdmin} meId={me.id} />
        </section>
        {me.customerAdmin && (
          <section className="space-y-2">
            <h2 className="font-medium">Eure Farbe</h2>
            <p className="text-sm text-muted">
              In dieser Farbe erscheinen eure Projekte im Kalender und auf dem Board.
            </p>
            <ColorPicker userId={customer.id} name={customer.name} color={customer.color} kind="customer" />
          </section>
        )}
      </div>
    </>
  );
}
