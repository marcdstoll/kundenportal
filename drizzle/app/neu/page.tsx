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
  if (me.role === "cutter") redirect("/board");

  // Admins können ein Projekt für einen Client anlegen
  const clients = me.role === "admin" ? await listUsers("kunde") : [];

  return (
    <>
      <PageHeader title="Neues Projekt" />
      <div className="max-w-2xl px-6 pb-10 md:px-10">
        <NewJobForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} isAdmin={me.role === "admin"} />
      </div>
    </>
  );
}
