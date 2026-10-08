import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type Role = "kunde" | "cutter" | "admin";

// Für API-Routen: prüft, ob die Anfrage von einem Admin kommt
export async function getAdmin(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session || session.user.role !== "admin") return null;
  return session;
}

// Für Seiten und Server Actions: der angemeldete Nutzer (oder null)
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: (session.user.role ?? "kunde") as Role,
    active: session.user.active ?? true,
  };
}

// Wirft einen Fehler, wenn niemand angemeldet ist oder die Rolle nicht passt
export async function requireUser(...roles: Role[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Nicht angemeldet.");
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new Error("Keine Berechtigung.");
  }
  return user;
}
