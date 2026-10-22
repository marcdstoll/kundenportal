import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { clientLogos } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { Avatar } from "@/app/components/ui";
import { ColorPicker } from "@/app/components/color-picker";

const ROLE_LABELS: Record<string, string> = { kunde: "Client", cutter: "Cutter", admin: "Admin" };

// Mein Profil: für alle Nutzer. Hier stellt jeder seine Farbe ein.
export default function ProfilePage() {
  return <Content />;
}

async function Content() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const [[prof], logos] = await Promise.all([
    db.select({ color: profiles.color }).from(profiles).where(eq(profiles.userId, me.id)),
    clientLogos(),
  ]);
  return (
    <>
      <PageHeader title="Mein Profil" />
      <div className="max-w-2xl space-y-8 px-4 pb-10 sm:px-6 md:px-10">
        <section className="flex items-center gap-4">
          <Avatar name={me.name} id={me.id} size="lg" logoUrl={logos.get(me.id)} />
          <div className="text-sm">
            <p className="text-base font-medium">{me.name}</p>
            <p className="text-muted">{me.email}</p>
            <p className="text-muted">{ROLE_LABELS[me.role] ?? me.role}</p>
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="font-medium">Meine Farbe</h2>
          <p className="text-sm text-muted">
            {me.role === "kunde"
              ? "In dieser Farbe erscheinst du im Portal, z. B. bei Kommentaren. Die Farbe eurer Projekte im Kalender und auf dem Board stellt ein Admin unter „Team“ ein."
              : "In dieser Farbe erscheinst du im Portal, z. B. bei Kommentaren und Projekten."}
          </p>
          <ColorPicker userId={me.id} name={me.name} color={prof?.color ?? null} />
        </section>
      </div>
    </>
  );
}
