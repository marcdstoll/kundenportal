import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerMembers, customers } from "@/db/schema";
import { auth } from "@/lib/auth";

export type Role = "kunde" | "cutter" | "admin";

// Für API-Routen: prüft, ob die Anfrage von einem Admin kommt
export async function getAdmin(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session || session.user.role !== "admin") return null;
  return session;
}

// Kunden-Nutzer: zu welchem Kunden (Firma) gehört er, und ist er dort Admin?
export async function membershipOf(userId: string) {
  const [m] = await db
    .select({ customerId: customerMembers.customerId, isAdmin: customerMembers.isAdmin })
    .from(customerMembers)
    .where(eq(customerMembers.userId, userId));
  return m ?? null;
}

// Für API-Routen: Betrachter (inkl. Kunde) aus einer Sitzung
export async function viewerOf(session: { user: { id: string; role?: string | null } }) {
  const role = (session.user.role ?? "kunde") as Role;
  const m = role === "kunde" ? await membershipOf(session.user.id) : null;
  return { id: session.user.id, role, customerId: m?.customerId ?? null };
}

// Für Seiten und Server Actions: der angemeldete Nutzer (oder null)
// customerId/customerAdmin nur bei Kunden-Nutzern: ihr Kunde (Firma) und ob sie dort Admin sind
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const role = (session.user.role ?? "kunde") as Role;
  const m = role === "kunde" ? await membershipOf(session.user.id) : null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role,
    active: session.user.active ?? true,
    customerId: m?.customerId ?? null,
    customerAdmin: m?.isAdmin ?? false,
  };
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Wirft einen Fehler, wenn niemand angemeldet ist oder die Rolle nicht passt
export async function requireUser(...roles: Role[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Nicht angemeldet.");
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new Error("Keine Berechtigung.");
  }
  return user;
}

// Wessen Kundenansicht wird gezeigt? Kunden-Nutzer sehen ihren Kunden,
// Admins können über ?as=<Kunden-ID> die Ansicht eines Kunden öffnen.
export async function resolveCustomerView(me: CurrentUser, asParam: string | undefined) {
  const load = async (id: string) => {
    const [c] = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.id, id));
    return c ?? null;
  };
  if (me.role === "kunde") {
    const customer = me.customerId ? await load(me.customerId) : null;
    return customer ? { customer, viewAs: null } : null;
  }
  if (me.role === "admin" && asParam) {
    const customer = await load(asParam);
    if (customer) return { customer, viewAs: customer };
  }
  return null;
}
