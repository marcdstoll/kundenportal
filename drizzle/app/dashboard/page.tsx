import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

// Leitet je nach Rolle weiter: Kunden zu ihren Aufträgen, Cutter und Admins zum Board
export default function DashboardPage() {
  return (
    <RoleRedirect />
  );
}

async function RoleRedirect() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(user.role === "kunde" ? "/kunde" : "/board");
  return null;
}
