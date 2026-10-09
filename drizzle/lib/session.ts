import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { listUsers } from "@/lib/queries";

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

// Wessen Kundenansicht wird gezeigt? Kunden sehen sich selbst,
// Admins können über ?as=<id> die Ansicht eines Kunden öffnen.
export async function resolveCustomerView(
  me: { id: string; name: string; role: Role },
  asParam: string | undefined
) {
  if (me.role === "kunde") return { customer: { id: me.id, name: me.name }, viewAs: null };
  if (me.role === "admin" && asParam) {
    const client = (await listUsers("kunde")).find((c) => c.id === asParam);
    if (client) {
      const customer = { id: client.id, name: client.name };
      return { customer, viewAs: customer };
    }
  }
  return null;
}
