import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { TopBar } from "@/app/components/top-bar";
import { NewJobForm } from "./new-job-form";

export default function NeuerAuftragPage() {
  return (
    <Suspense fallback={<p className="p-8">Lade…</p>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "cutter") redirect("/board");

  return (
    <>
      <TopBar user={user} />
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-6 text-2xl font-semibold">Neuer Auftrag</h1>
        <NewJobForm />
      </main>
    </>
  );
}
