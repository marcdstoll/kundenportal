// Angaben für Impressum und Mail-Fußzeile – hier zentral pflegen.
// Leere Felder ("") werden automatisch weggelassen.
export const LEGAL = {
  owner: "Mario Leocata", // Einzelunternehmer (nicht im Firmenbuch)
  brand: "Great Influence", // nur Markenname
  street: "Schnirchgasse 13 / 22.12",
  city: "1030 Wien",
  country: "Österreich",
  email: "mario@great-influence.com",
  phone: "", // optional, z. B. "+43 660 1234567"
  uid: "", // UID-Nummer, falls vorhanden, z. B. "ATU12345678"
  gisa: "", // GISA-Zahl, optional
  trade:
    "Technischer Transfer (Entwickeln, Kopieren und Überspielen) und Synchronisation audiovisueller Produktionen, Überspielen auf Trägermaterial jeder Art sowie Be- und Nachbearbeitung und digitale Bild- und Tongestaltung für Bewegtbild",
  authority: "Magistrat der Stadt Wien",
  chamber: "Wirtschaftskammer Wien, Fachvertretung Film- und Musikwirtschaft",
};

// Öffentliche Adresse des Portals (für Links in Mails)
export function portalUrl(path = "") {
  const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}
