import { eq } from "drizzle-orm";
import { db } from "@/db";
import { frameioConnection } from "@/db/schema";

const IMS = "https://ims-na1.adobelogin.com/ims";
const SCOPES = "openid email profile offline_access additional_info.roles";
const API = process.env.FRAMEIO_API_URL ?? "https://api.frame.io/v4";

// Name des Frame.io-Projekts, in dem die Aufträge landen
const PROJECT_NAME = "Kundenportal";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

// ---------- Anmeldung bei Adobe ----------

// Adresse der Adobe-Anmeldeseite
export function getAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.FRAMEIO_CLIENT_ID!,
    redirect_uri: process.env.FRAMEIO_REDIRECT_URI!,
    scope: SCOPES,
    response_type: "code",
    state,
  });
  return `${IMS}/authorize/v2?${params}`;
}

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${IMS}/token/v3`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.FRAMEIO_CLIENT_ID!,
      client_secret: process.env.FRAMEIO_CLIENT_SECRET!,
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`Adobe-Token-Fehler ${res.status}: ${await res.text()}`);
  return res.json();
}

async function saveTokens(t: TokenResponse, oldRefreshToken?: string) {
  // Adobe liefert die Laufzeit in Sekunden; falls Millisekunden, umrechnen
  const seconds = t.expires_in > 1_000_000 ? t.expires_in / 1000 : t.expires_in;
  const values = {
    id: "default",
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? oldRefreshToken!,
    expiresAt: new Date(Date.now() + (seconds - 60) * 1000),
    updatedAt: new Date(),
  };
  await db
    .insert(frameioConnection)
    .values(values)
    .onConflictDoUpdate({ target: frameioConnection.id, set: values });
}

// Einmal-Code von Adobe gegen Zugangsschlüssel tauschen
export async function connectWithCode(code: string) {
  await saveTokens(await requestToken({ grant_type: "authorization_code", code }));
}

// Gültigen Zugangsschlüssel holen, bei Bedarf automatisch erneuern
async function getAccessToken() {
  const [conn] = await db
    .select()
    .from(frameioConnection)
    .where(eq(frameioConnection.id, "default"));
  if (!conn) throw new Error("Frame.io ist noch nicht verbunden.");
  if (conn.expiresAt > new Date()) return conn.accessToken;

  const t = await requestToken({
    grant_type: "refresh_token",
    refresh_token: conn.refreshToken,
  });
  await saveTokens(t, conn.refreshToken);
  return t.access_token;
}

// ---------- Allgemeine API-Anfrage ----------

export async function frameio(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string>),
    },
  });
  if (!res.ok) throw new Error(`Frame.io-Fehler ${res.status} bei ${path}: ${await res.text()}`);
  return res.json();
}

// ---------- Projekt, Ordner, Uploads ----------

type Target = { accountId: string; rootFolderId: string };
let cachedTarget: Target | null = null;

// Konto und Hauptordner des Projekts "Kundenportal" ermitteln (wird zwischengespeichert)
async function getTarget(): Promise<Target> {
  if (cachedTarget) return cachedTarget;

  const accounts = await frameio("/accounts");
  for (const account of accounts.data) {
    const workspaces = await frameio(`/accounts/${account.id}/workspaces`);
    for (const workspace of workspaces.data) {
      const projects = await frameio(
        `/accounts/${account.id}/workspaces/${workspace.id}/projects?page_size=100`
      );
      const project = projects.data.find(
        (p: { name: string }) => p.name === PROJECT_NAME
      );
      if (project) {
        cachedTarget = { accountId: account.id, rootFolderId: project.root_folder_id };
        return cachedTarget;
      }
    }
  }
  throw new Error(`Frame.io-Projekt "${PROJECT_NAME}" nicht gefunden.`);
}

// Ordner in einem anderen Ordner anlegen
export async function createFolder(parentId: string, name: string) {
  const { accountId } = await getTarget();
  const res = await frameio(`/accounts/${accountId}/folders/${parentId}/folders`, {
    method: "POST",
    body: JSON.stringify({ data: { name } }),
  });
  return { id: res.data.id as string, url: res.data.view_url as string };
}

// Projektordner mit Unterordner "Raw" für die Dateien des Kunden anlegen
export async function createJobFolder(name: string) {
  const { rootFolderId } = await getTarget();
  const folder = await createFolder(rootFolderId, name);
  const raw = await createFolder(folder.id, "Raw");
  return { id: folder.id, url: folder.url, rawId: raw.id };
}

export type UploadPart = { size: number; url: string };

// Leere Datei in Frame.io anlegen und die Upload-Links dafür holen
export async function createUpload(folderId: string, name: string, size: number) {
  const { accountId } = await getTarget();
  const res = await frameio(`/accounts/${accountId}/folders/${folderId}/files/local_upload`, {
    method: "POST",
    body: JSON.stringify({ data: { name, file_size: size } }),
  });
  return {
    fileId: res.data.id as string,
    viewUrl: res.data.view_url as string,
    mediaType: res.data.media_type as string,
    parts: res.data.upload_urls as UploadPart[],
  };
}

// Zeitlich begrenzte Links zum Herunterladen und Abspielen der Originaldatei
export async function getFileLinks(fileId: string) {
  const { accountId } = await getTarget();
  const res = await frameio(`/accounts/${accountId}/files/${fileId}?include=media_links.original`);
  const original = res.data.media_links?.original;
  return {
    downloadUrl: (original?.download_url as string | undefined) ?? null,
    inlineUrl: (original?.inline_url as string | undefined) ?? null,
  };
}
