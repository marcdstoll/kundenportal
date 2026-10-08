import { auth } from "@/lib/auth";

export async function getAdmin(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session || session.user.role !== "admin") return null;
  return session;
}