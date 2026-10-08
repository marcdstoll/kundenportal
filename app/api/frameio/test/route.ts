import { NextRequest } from "next/server";
import { getAdmin } from "@/lib/session";
import { frameio } from "@/lib/frameio";

export async function GET(req: NextRequest) {
  if (!(await getAdmin(req.headers))) {
    return new Response("Nur für Admins", { status: 403 });
  }

  try {
    const accounts = await frameio("/accounts");
    const accountId = accounts.data[0].id;

    const workspaces = await frameio(`/accounts/${accountId}/workspaces`);
    const workspace = workspaces.data[0];

    const projects = await frameio(
      `/accounts/${accountId}/workspaces/${workspace.id}/projects`
    );
    const project =
      projects.data.find((p: { name: string }) => p.name === "Kundenportal") ??
      projects.data[0];

    // Leere Testdatei anlegen, um einen echten Upload-Link zu bekommen
    const file = await frameio(
      `/accounts/${accountId}/folders/${project.root_folder_id}/files/local_upload`,
      {
        method: "POST",
        body: JSON.stringify({ data: { name: "cors-test.txt", file_size: 12 } }),
      }
    );
    const uploadUrl: string = file.data.upload_urls[0].url;

    // Den Browser-Vorabcheck nachstellen
    const preflight = await fetch(uploadUrl, {
      method: "OPTIONS",
      headers: {
        Origin: process.env.BETTER_AUTH_URL!,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type,x-amz-acl",
      },
    });
    const allowOrigin = preflight.headers.get("access-control-allow-origin");

    return Response.json({
      verbunden: true,
      workspace: workspace.name,
      projekt: project.name,
      corsStatus: preflight.status,
      erlaubteOrigin: allowOrigin,
      browserUploadMoeglich: preflight.ok && !!allowOrigin,
    });
  } catch (e) {
    return Response.json({ fehler: String(e) }, { status: 500 });
  }
}