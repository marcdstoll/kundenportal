import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobFiles, jobs } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getFileLinks } from "@/lib/frameio";
import { CUSTOMER_VIDEO_STATUSES } from "@/lib/status";

// Leitet zu einem kurzlebigen Frame.io-Link weiter, nachdem die Berechtigung geprüft wurde.
// ?mode=download → Datei herunterladen, ?mode=play → im Player abspielen
export async function GET(req: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Nicht angemeldet", { status: 401 });

  const { id } = await ctx.params;
  const [row] = await db
    .select({ file: jobFiles, job: jobs })
    .from(jobFiles)
    .innerJoin(jobs, eq(jobFiles.jobId, jobs.id))
    .where(eq(jobFiles.id, id));
  if (!row) return new Response("Datei nicht gefunden", { status: 404 });

  const role = session.user.role ?? "kunde";
  const isStaff = role === "cutter" || role === "admin";
  const isOwner = row.job.customerId === session.user.id;
  const customerMayView =
    row.file.kind === "roh" || CUSTOMER_VIDEO_STATUSES.includes(row.job.status);
  if (!isStaff && !(isOwner && customerMayView)) {
    return new Response("Keine Berechtigung", { status: 403 });
  }

  try {
    const links = await getFileLinks(row.file.frameioFileId);
    const target = req.nextUrl.searchParams.get("mode") === "play" ? links.inlineUrl : links.downloadUrl;
    if (!target) {
      return new Response("Frame.io verarbeitet die Datei noch. Bitte gleich nochmal versuchen.", { status: 409 });
    }
    return NextResponse.redirect(target);
  } catch (e) {
    console.error(e);
    return new Response("Datei ist gerade nicht erreichbar.", { status: 502 });
  }
}
