import { NextRequest, NextResponse } from "next/server";
import { cleanupStaleUploads } from "@/lib/cleanup";

// Wird regelmäßig von Coolify aufgerufen (Scheduled Task, alle 15 Minuten).
// Geschützt über die Umgebungsvariable CRON_SECRET: Aufruf mit "Authorization: Bearer <CRON_SECRET>".
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET ist nicht gesetzt", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Nicht erlaubt", { status: 401 });
  return NextResponse.json(await cleanupStaleUploads());
}
