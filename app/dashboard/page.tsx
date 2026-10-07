import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";

export default function DashboardPage() {
  return (
    <main className="p-8">
      <Suspense fallback={<p>Lade…</p>}>
        <UserInfo />
      </Suspense>
    </main>
  );
}

async function UserInfo() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Hallo {session.user.name}</h1>
      <p>E-Mail: {session.user.email}</p>
      <p>Rolle: {session.user.role}</p>
      <SignOutButton />
    </div>
  );
}