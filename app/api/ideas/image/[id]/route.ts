import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ideaAttachments, projectIdeas } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canSeeIdea } from "@/lib/access";
import { viewerOf } from "@/lib/session";

// Screenshot einer Projekt-Idee anzeigen – nur für Personen, die die Idee sehen dürfen
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  const [row] = await db
    .select({ data: ideaAttachments.data, customerId: projectIdeas.customerId })
    .from(ideaAttachments)
    .innerJoin(projectIdeas, eq(ideaAttachments.ideaId, projectIdeas.id))
    .where(eq(ideaAttachments.id, id));
  if (!row) return new Response(null, { status: 404 });
  if (!(await canSeeIdea(await viewerOf(session), row.customerId))) {
    return new Response(null, { status: 403 });
  }
  const m = row.data.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
