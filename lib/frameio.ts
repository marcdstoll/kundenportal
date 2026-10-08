import { eq } from "drizzle-orm";
import { db } from "@/db";
import { frameioConnection } from "@/db/schema";

const IMS = "https://ims-na1.adobelogin.com/ims";
const SCOPES = "openid email profile offline_access additional_info.roles";
const API = "https://api.frame.io/v4";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

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

// Anfrage an die Frame.io-API
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