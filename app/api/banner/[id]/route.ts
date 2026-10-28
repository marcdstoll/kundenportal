import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { auth } from "@/lib/auth";

// Banner der Kunden-Übersicht. Die URL enthält ?v=…, daher lange zwischenspeicherbar.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  const [row] = await db.select({ banner: customers.banner }).from(customers).where(eq(customers.id, id));
  const m = row?.banner?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
