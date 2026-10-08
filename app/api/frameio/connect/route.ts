import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAdmin } from "@/lib/session";
import { getAuthorizeUrl } from "@/lib/frameio";

export async function GET(req: NextRequest) {
  if (!(await getAdmin(req.headers))) {
    return new Response("Nur für Admins", { status: 403 });
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(getAuthorizeUrl(state));
  res.cookies.set("frameio_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}