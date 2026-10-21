// @-Erwähnungen in Kommentaren.
// Gespeichert wird im Text ein Token  @[Name](userId)  – angezeigt wird nur „@Name“.
// Im Eingabefeld steht ebenfalls nur „@Name“; erst beim Absenden wird daraus wieder das Token.

export type MentionPerson = { id: string; name: string; email?: string; role?: string };

const TOKEN = /@\[([^\]\n]{1,80})\]\(([A-Za-z0-9_-]{1,64})\)/g;

// Name so säubern, dass er das Token nicht kaputt macht
const clean = (name: string) => name.replace(/[[\]()\n]/g, "").trim();

// IDs aller erwähnten Personen (ohne Doppelte)
export function mentionIds(body: string): string[] {
  return [...new Set([...body.matchAll(TOKEN)].map((m) => m[2]))];
}

// Für Inbox-Texte, Vorschauen usw.: Tokens → „@Name“
export function toPlain(body: string) {
  return body.replace(TOKEN, (_, name: string) => `@${name}`);
}

// Zum Bearbeiten: lesbarer Text + Liste der Erwähnungen
export function toEditable(body: string): { text: string; mentions: MentionPerson[] } {
  const mentions = new Map<string, MentionPerson>();
  for (const m of body.matchAll(TOKEN)) mentions.set(m[2], { id: m[2], name: m[1] });
  return { text: toPlain(body), mentions: [...mentions.values()] };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Beim Absenden: „@Name“ der ausgewählten Personen → Token (längere Namen zuerst, damit „@Anna Maria“ vor „@Anna“ greift)
export function encodeMentions(text: string, mentions: MentionPerson[]) {
  let out = text;
  const sorted = [...mentions].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const name = clean(p.name);
    if (!name) continue;
    const re = new RegExp(`(^|[^\\w\\[])@${escapeRe(name)}(?![\\w\\]])`, "g");
    out = out.replace(re, (_, pre: string) => `${pre}@[${name}](${p.id})`);
  }
  return out;
}

// Server: nur erlaubte Personen bleiben Erwähnungen, alles andere wird normaler Text
export function keepAllowedMentions(body: string, allowed: Set<string>) {
  return body.replace(TOKEN, (all, name: string, id: string) => (allowed.has(id) ? all : `@${name}`));
}

// Für die Anzeige: Text in Stücke zerlegen (normaler Text bzw. Erwähnung)
export type MentionPart = { text: string; mention?: { id: string; name: string } };
export function splitMentions(body: string): MentionPart[] {
  const parts: MentionPart[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    if (m.index! > last) parts.push({ text: body.slice(last, m.index) });
    parts.push({ text: `@${m[1]}`, mention: { id: m[2], name: m[1] } });
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts;
}
