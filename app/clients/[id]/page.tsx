import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { customerCoverUrl, customerLogoUrl, loadAssignments, loadCustomer, loadPeople } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { ColorPicker } from "@/app/components/color-picker";
import { buttonSecondary } from "@/app/components/ui";
import { FilterButton } from "@/app/components/filter-button";
import { AssignmentSelect, DeleteCustomerButton } from "@/app/components/admin-forms";
import { CustomerForm, MembersPanel } from "@/app/components/customer-forms";

// Kunde bearbeiten (nur Admins): Profil, Farbe, betreuende Cutter, Nutzer
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const [client, cutters, assignments] = await Promise.all([loadCustomer(id), loadPeople("cutter"), loadAssignments()]);
  if (!client) notFound();
  const assigned = new Set(assignments.filter((a) => a.clientId === id).map((a) => a.cutterId));

  return (
    <>
      <PageHeader title={client.name}>
        <Link href={`/kundenprofil/${id}`} className={buttonSecondary}>
          Detailansicht
        </Link>
        <FilterButton view="nach-clients" patch={{ c: id }} href="/nach-clients" className={buttonSecondary}>
          Projekte
        </FilterButton>
        <Link href={`/uebersicht?as=${id}`} className={buttonSecondary}>
          Kundenansicht
        </Link>
      </PageHeader>
      <div className="grid max-w-6xl gap-8 px-4 pb-10 sm:px-6 md:px-10 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Profil</h2>
          {/* kein key: Änderungen rechts (Farbe, Nutzer, Cutter) dürfen ungespeicherte Eingaben nicht verwerfen */}
          <CustomerForm customer={client} logoUrl={customerLogoUrl(client)} coverUrl={customerCoverUrl(client)} />
        </section>
        <aside className="space-y-8">
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Nutzer</h2>
            <p className="text-xs text-muted">
              Der erste Nutzer ist Admin. Admins des Kunden können selbst weitere Nutzer einladen und Admins ernennen.
            </p>
            <MembersPanel
              customerId={id}
              members={client.members}
              canManage
              meId={me.id}
              memberHref={`/clients/${id}/nutzer/USERID`}
            />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Farbe</h2>
            <p className="text-xs text-muted">Färbt die Projekte dieses Kunden im Kalender und auf dem Board.</p>
            <ColorPicker userId={id} name={client.name} color={client.color} kind="customer" />
          </section>
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
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-danger">Kunden löschen</h2>
            <DeleteCustomerButton customerId={id} name={client.name} />
          </section>
        </aside>
      </div>
    </>
  );
}
