import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listUsers, loadJobs } from "@/lib/queries";
import { PageHeader } from "@/app/components/shell";
import { Avatar } from "@/app/components/ui";

export default function ClientsPage() {
  return (
    <Content />
  );
}

const DONE = ["online", "storniert"];

async function Content() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "kunde") redirect("/kunde");

  const [clients, jobs] = await Promise.all([listUsers("kunde"), loadJobs()]);

  return (
    <>
      <PageHeader title="Clients" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3 px-6 pb-10 md:px-10">
        {clients.map((c) => {
          const own = jobs.filter((j) => j.customerId === c.id);
          const running = own.filter((j) => !DONE.includes(j.status)).length;
          const online = own.filter((j) => j.status === "online").length;
          return (
            <Link
              key={c.id}
              href={`/nach-clients?c=${c.id}`}
              className="flex flex-col items-start gap-4 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-muted/40"
            >
              <Avatar name={c.name} size="lg" />
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted">
                  {running} laufend, {online} online
                </p>
              </div>
            </Link>
          );
        })}
        {clients.length === 0 && <p className="text-sm text-muted">Noch keine Clients registriert.</p>}
      </div>
    </>
  );
}
