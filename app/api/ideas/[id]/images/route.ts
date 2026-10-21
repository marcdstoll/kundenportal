import { randomUUID } from "crypto";
import { eq, sum } from "drizzle-orm";
import { db } from "@/db";
import { ideaAttachments, projectIdeas } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canSeeIdea } from "@/lib/access";
import { MAX_SCREENSHOT_TOTAL, SCREENSHOT_TYPES } from "@/lib/features";

// Screenshot zu einer Projekt-Idee hochladen (alle, die die Idee sehen). Der Browser hat das Bild vorher verkleinert.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Nicht angemeldet", { status: 401 });
  const { id } = await ctx.params;

  const [idea] = await db.select().from(projectIdeas).where(eq(projectIdeas.id, id));
  if (!idea) return new Response("Idee nicht gefunden", { status: 404 });
  const me = { id: session.user.id, role: session.user.role ?? "kunde" };
  if (!(await canSeeIdea(me, idea.customerId))) return new Response("Keine Berechtigung", { status: 403 });

  const type = (req.headers.get("content-type") ?? "").split(";")[0];
  if (!SCREENSHOT_TYPES.includes(type)) return new Response("Nur PNG, JPG oder WebP", { status: 415 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0) return new Response("Leeres Bild", { status: 400 });

  // Alle Screenshots einer Idee zusammen höchstens 5 MB
  const [{ used }] = await db
    .select({ used: sum(ideaAttachments.size).mapWith(Number) })
    .from(ideaAttachments)
    .where(eq(ideaAttachments.ideaId, id));
  if ((used ?? 0) + bytes.length > MAX_SCREENSHOT_TOTAL) {
    return new Response("Zusammen höchstens 5 MB Screenshots pro Idee", { status: 413 });
  }

  await db.insert(ideaAttachments).values({
    id: randomUUID(),
    ideaId: id,
    data: `data:${type};base64,${bytes.toString("base64")}`,
    size: bytes.length,
  });
  return Response.json({ ok: true });
}
