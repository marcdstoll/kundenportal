// Personenfarben: Jede Person hat eine Farbe – selbst gewählt (Profil) oder automatisch aus dem Namen.
// Die gewählten Farben stehen als CSS-Variablen (--pc-<id>) im Seitenrahmen (AppFrame),
// dadurch reicht überall personColor(id, name) – egal ob Server- oder Browser-Komponente.

// Auswahl im Farbwähler (gut unterscheidbar, hell und dunkel lesbar)
export const PALETTE = [
  "#e5484d", // Rot
  "#f76b15", // Orange
  "#ffb224", // Gelb
  "#46a758", // Grün
  "#12a594", // Türkis
  "#0090ff", // Blau
  "#3e63dd", // Indigo
  "#8e4ec6", // Violett
  "#d6409f", // Pink
  "#ad7f58", // Braun
  "#8d8d8d", // Grau
  "#2f3238", // Anthrazit
];

export function isColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

// Automatischer Farbton aus dem Namen (immer derselbe für denselben Namen)
export function personHue(name: string) {
  return [...name].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
}

export const defaultColor = (name: string) => `hsl(${personHue(name)} 65% 55%)`;

const varName = (id: string) => `--pc-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

// Farbe einer Person: gewählte Farbe, sonst die automatische
export function personColor(id: string | null | undefined, name: string) {
  return id ? `var(${varName(id)}, ${defaultColor(name)})` : defaultColor(name);
}

// CSS für den Seitenrahmen: alle gewählten Farben als Variablen
export function colorStyles(rows: { id: string; color: string | null }[]) {
  const decl = rows
    .filter((r) => r.color && isColor(r.color))
    .map((r) => `${varName(r.id)}:${r.color}`)
    .join(";");
  return decl ? `:root{${decl}}` : "";
}

// Automatische Farbe als Hex (für die Vorschau im Farbwähler)
export function defaultColorHex(name: string) {
  const h = personHue(name) / 360;
  const s = 0.65;
  const l = 0.55;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
