import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

// Bekannte Einstellungen (Schlüssel in der Tabelle "settings")
export const SETTING_KEYS = {
  onboardingKunde: "onboarding_video_kunde",
  onboardingCutter: "onboarding_video_cutter",
  // Frame.io-Ordner für persönliche Begrüßungsvideos (wird beim ersten Video angelegt)
  welcomeFolder: "frameio_welcome_folder",
  // Hall of Fame auch für Cutter sichtbar ("1" = ja); zum Start nur Admins
  hallOfFameCutter: "hall_of_fame_cutter",
} as const;

export async function hallOfFameForCutters() {
  return (await getSetting(SETTING_KEYS.hallOfFameCutter)) === "1";
}

export async function getSetting(key: string) {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string | null) {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function onboardingVideoFor(role: string) {
  return getSetting(role === "cutter" ? SETTING_KEYS.onboardingCutter : SETTING_KEYS.onboardingKunde);
}
