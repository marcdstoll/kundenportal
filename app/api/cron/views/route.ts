import { NextRequest, NextResponse } from "next/server";
import { runDailyViewSyncIfDue } from "@/lib/view-sync";
import { runDeadlineReminders } from "@/lib/deadline-reminders";

// Stündlicher Cron (Coolify Scheduled Task "0 * * * *"):
// - Deadline-Erinnerungen (2 Tage vorher) für Projekte und ToDos – jede Meldung nur einmal
// - Hall of Fame: Views abrufen, einmal pro Tag beim ersten Aufruf nach 00:00 Uhr Wiener Zeit
// Geschützt über CRON_SECRET: Aufruf mit "Authorization: Bearer <CRON_SECRET>".
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET ist nicht gesetzt", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Nicht erlaubt", { status: 401 });
  const deadlines = await runDeadlineReminders();
  return NextResponse.json({ ...(await runDailyViewSyncIfDue()), deadlines });
}
