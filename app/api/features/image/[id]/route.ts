import { eq } from "drizzle-orm";
import { db } from "@/db";
import { featureAttachments } from "@/db/schema";
import { auth } from "@/lib/auth";

// Screenshot anzeigen – für alle angemeldeten Nutzer (Features sind für alle sichtbar)
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  const [row] = await db
    .select({ data: featureAttachments.data })
    .from(featureAttachments)
    .where(eq(featureAttachments.id, id));
  const m = row?.data.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
