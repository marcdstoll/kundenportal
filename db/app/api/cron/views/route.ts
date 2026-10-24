import { NextRequest, NextResponse } from "next/server";
import { runDailyViewSyncIfDue } from "@/lib/view-sync";

// Hall of Fame: Views abrufen. Coolify ruft das stündlich auf (Scheduled Task "0 * * * *");
// abgerufen wird einmal pro Tag, beim ersten Aufruf nach 00:00 Uhr Wiener Zeit.
// Geschützt über CRON_SECRET: Aufruf mit "Authorization: Bearer <CRON_SECRET>".
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET ist nicht gesetzt", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Nicht erlaubt", { status: 401 });
  return NextResponse.json(await runDailyViewSyncIfDue());
}
