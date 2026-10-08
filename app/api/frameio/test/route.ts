import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/session";
import { frameio } from "@/lib/frameio";

export async function GET(req: NextRequest) {
  if (!(await getAdmin(req.headers))) {
    return new Response("Nur für Admins", { status: 403 });
  }
  try {
    const accounts = await frameio("/accounts");
    return Response.json({ verbunden: true, konten: accounts.data.length });
  } catch (e) {
    return Response.json({ fehler: String(e) }, { status: 500 });
  }
}
