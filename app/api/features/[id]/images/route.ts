import { randomUUID } from "crypto";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { featureAttachments, featureRequests } from "@/db/schema";
import { auth } from "@/lib/auth";
import { MAX_SCREENSHOTS, MAX_SCREENSHOT_BYTES, SCREENSHOT_TYPES } from "@/lib/features";

// Screenshot zu einem Feature hochladen (Ersteller oder Admin). Der Browser hat das Bild vorher verkleinert.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Nicht angemeldet", { status: 401 });
  const { id } = await ctx.params;

  const [feature] = await db.select().from(featureRequests).where(eq(featureRequests.id, id));
  if (!feature) return new Response("Feature nicht gefunden", { status: 404 });
  if (session.user.role !== "admin" && feature.createdBy !== session.user.id) {
    return new Response("Keine Berechtigung", { status: 403 });
  }
  const [{ n }] = await db.select({ n: count() }).from(featureAttachments).where(eq(featureAttachments.featureId, id));
  if (n >= MAX_SCREENSHOTS) return new Response(`Höchstens ${MAX_SCREENSHOTS} Screenshots`, { status: 400 });

  const type = (req.headers.get("content-type") ?? "").split(";")[0];
  if (!SCREENSHOT_TYPES.includes(type)) return new Response("Nur PNG, JPG oder WebP", { status: 415 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_SCREENSHOT_BYTES) return new Response("Bild zu groß", { status: 413 });

  await db.insert(featureAttachments).values({
    id: randomUUID(),
    featureId: id,
    data: `data:${type};base64,${bytes.toString("base64")}`,
    size: bytes.length,
  });
  return Response.json({ ok: true });
}
