import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadCustomer } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { RegenerateInvite, WelcomeVideoSection } from "@/app/components/admin-forms";
import { MemberForm } from "@/app/components/customer-forms";

// Ein Nutzer eines Kunden (nur Admins): persönliche Daten, Begrüßungsvideo, Zugang
export default async function MemberPage({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/dashboard");

  const { id, userId } = await params;
  const client = await loadCustomer(id);
  const member = client?.members.find((m) => m.id === userId);
  if (!client || !member) notFound();

  return (
    <>
      <PageHeader title={member.name}>
        <Link href={`/clients/${id}`} className="text-sm text-accent hover:underline">
          ← {client.name}
        </Link>
      </PageHeader>
      <div className="grid max-w-5xl gap-8 px-4 pb-10 sm:px-6 md:px-10 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Persönliche Daten</h2>
          <p className="text-sm text-muted">
            Login-E-Mail: <span className="text-text">{member.email}</span> · {member.isAdmin ? "Admin" : "Nutzer"} bei{" "}
            {client.name}
          </p>
          <MemberForm member={member} />
        </section>
        <aside className="space-y-8">
          {member.invited && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Persönliches Begrüßungsvideo</h2>
              <WelcomeVideoSection
                userId={member.id}
                hasVideo={!!member.welcomeVideo?.startsWith("frameio:")}
                version={member.version}
              />
            </section>
          )}
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Zugang</h2>
            <p className="text-sm text-muted">
              {member.invited ? "Eingeladen – Passwort noch nicht gesetzt." : "Aktiv – Passwort gesetzt."}
            </p>
            <RegenerateInvite userId={member.id} invited={member.invited} />
          </section>
        </aside>
      </div>
    </>
  );
}
