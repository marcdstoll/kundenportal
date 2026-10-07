import { connection } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  await connection(); 
  const result = await db.execute(sql`select now() as zeit`);
  return Response.json({ ok: true, db: result[0] });
}