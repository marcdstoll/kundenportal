import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listCustomers, listUsers } from "@/lib/queries";
import { clientIdsOfCutter } from "@/lib/access";
import { PageHeader } from "@/app/components/shell";
import { NewJobForm } from "./new-job-form";

export default function NeuesProjektPage() {
  return (
    <Content />
  );
}

async function Content() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  // Admins und Cutter legen ein Projekt für einen Client an
  const isStaff = me.role !== "kunde";
  const all = isStaff ? await listCustomers() : [];
  // Cutter legen nur für ihre freigegebenen Kunden an
  const allowed = me.role === "cutter" ? await clientIdsOfCutter(me.id) : null;
  const clients = allowed ? all.filter((c) => allowed.includes(c.id)) : all;
  // Admins können schon beim Anlegen Cutter zuordnen
  const staff = me.role === "admin" ? await listUsers("cutter", "admin") : [];

  return (
    <>
      <PageHeader title="Projekt anlegen" />
      <div className="max-w-2xl px-4 pb-10 sm:px-6 md:px-10">
        <NewJobForm
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          isStaff={isStaff}
          cutters={staff.map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>
    </>
  );
}
