import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invites, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getFileLinks } from "@/lib/frameio";
import { onboardingVideoFor } from "@/lib/settings";

// Onboarding-Video abspielen (liegt in Frame.io, wird direkt im Portal gezeigt – kein YouTube nötig).
// Erlaubt für angemeldete Nutzer und für Eingeladene über ihren noch gültigen Einladungslink (?t=…).
export async function GET(req: NextRequest, ctx: { params: Promise<{ role: string }> }) {
  const { role } = await ctx.params;
  if (role !== "kunde" && role !== "cutter") return new Response("Unbekannt", { status: 404 });
  const token = req.nextUrl.searchParams.get("t");

  let allowed = !!(await auth.api.getSession({ headers: req.headers }));
  if (!allowed && token) {
    const [inv] = await db
      .select({ role: user.role })
      .from(invites)
      .innerJoin(user, eq(invites.userId, user.id))
      .where(and(eq(invites.token, token), isNull(invites.usedAt), gt(invites.expiresAt, new Date())));
    allowed = !!inv && (inv.role === "cutter" ? "cutter" : "kunde") === role;
  }
  if (!allowed) return new Response("Keine Berechtigung", { status: 403 });

  const value = await onboardingVideoFor(role);
  const fileId = value?.startsWith("frameio:") ? value.slice("frameio:".length) : null;
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
