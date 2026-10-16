import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invites, profiles } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getFileLinks } from "@/lib/frameio";

// Persönliches Begrüßungsvideo abspielen (liegt in Frame.io).
// Erlaubt für Admins und für die eingeladene Person selbst über ihren noch gültigen Einladungslink (?t=…).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = req.nextUrl.searchParams.get("t");

  let allowed = false;
  const session = await auth.api.getSession({ headers: req.headers });
  if (session?.user.role === "admin") allowed = true;
  if (!allowed && token) {
    const [inv] = await db
      .select({ token: invites.token })
      .from(invites)
      .where(
        and(eq(invites.token, token), eq(invites.userId, id), isNull(invites.usedAt), gt(invites.expiresAt, new Date())),
      );
    allowed = !!inv;
  }
  if (!allowed) return new Response("Keine Berechtigung", { status: 403 });

  const [prof] = await db.select({ welcome: profiles.welcomeVideo }).from(profiles).where(eq(profiles.userId, id));
  const fileId = prof?.welcome?.startsWith("frameio:") ? prof.welcome.slice("frameio:".length) : null;
  if (!fileId) return new Response("Kein Video hinterlegt", { status: 404 });

  try {
    const links = await getFileLinks(fileId);
    if (!links.inlineUrl) return new Response("Das Video wird noch verarbeitet.", { status: 409 });
    return NextResponse.redirect(links.inlineUrl);
  } catch (e) {
    console.error(e);
    return new Response("Video ist gerade nicht erreichbar.", { status: 502 });
  }
}
