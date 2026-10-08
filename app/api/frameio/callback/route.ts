import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/session";
import { connectWithCode } from "@/lib/frameio";

export async function GET(req: NextRequest) {
  if (!(await getAdmin(req.headers))) {
    return new Response("Nur für Admins", { status: 403 });
  }
  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    return new Response(`Adobe meldet: ${params.get("error")}`, { status: 400 });
  }
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || state !== req.cookies.get("frameio_state")?.value) {
    return new Response("Ungültige Anfrage", { status: 400 });
  }
  try {
    await connectWithCode(code);
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
  const res = NextResponse.redirect(new URL("/dashboard?frameio=verbunden", process.env.BETTER_AUTH_URL));
  res.cookies.delete("frameio_state");
  return res;
}
