import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, profiles } from "@/db/schema";
import { auth } from "@/lib/auth";

// Liefert das Logo eines Kunden (oder einer Person) als Bild. Die URL enthält ?v=<Zeitstempel>,
// deshalb darf der Browser es lange zwischenspeichern – bei neuem Logo ändert sich die URL.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response(null, { status: 401 });

  const { id } = await ctx.params;
  // Erst Kunde (Firma), sonst Person (z. B. Cutter mit Logo)
  const [firm] = await db.select({ logo: customers.logo }).from(customers).where(eq(customers.id, id));
  const [person] = firm?.logo ? [] : await db.select({ logo: profiles.logo }).from(profiles).where(eq(profiles.userId, id));
  const row = firm?.logo ? firm : person;
  const m = row?.logo?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });

  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
