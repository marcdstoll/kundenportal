import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listUsers } from "@/lib/queries";
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
  const clients = isStaff ? await listUsers("kunde") : [];

  return (
    <>
      <PageHeader title="Neues Projekt" />
      <div className="max-w-2xl px-6 pb-10 md:px-10">
        <NewJobForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} isStaff={isStaff} />
      </div>
    </>
  );
}
