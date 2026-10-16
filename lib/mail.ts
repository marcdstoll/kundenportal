import nodemailer, { type Transporter } from "nodemailer";

// E-Mail-Versand über SMTP. Alles kommt aus Umgebungsvariablen (Coolify → Environment Variables):
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_SECURE ("true" nur bei Port 465), MAIL_FROM
// Zum Testen: Mailpit (fängt alle Mails ab, nichts geht raus). Später: Versanddienst wie Brevo/Resend/Postmark.
// Ist SMTP_HOST nicht gesetzt, wird nichts verschickt – die App läuft trotzdem normal weiter.

export function mailConfigured() {
  return !!process.env.SMTP_HOST;
}

export function mailInfo() {
  return mailConfigured() ? `${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587}` : null;
}

let transporter: Transporter | null = null;
function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

// Gibt zurück, ob verschickt wurde; Fehler werden geloggt, aber nicht weitergeworfen
export async function sendMail(to: string, subject: string, html: string, text: string) {
  return (await trySendMail(to, subject, html, text)).ok;
}

// Wie sendMail, liefert bei Fehlern aber eine verständliche Begründung (für die Testmail in den Einstellungen)
export async function trySendMail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!mailConfigured()) {
    console.log(`[Mail] nicht verschickt (SMTP nicht eingerichtet): "${subject}" an ${to}`);
    return { ok: false, error: "Mailversand ist nicht eingerichtet (SMTP_HOST fehlt)." };
  }
  try {
    await getTransporter().sendMail({
      from: process.env.MAIL_FROM ?? "Contenthaus <noreply@contenthaus.local>",
      to,
      subject,
      html,
      text,
    });
    console.log(`[Mail] verschickt: "${subject}" an ${to}`);
    return { ok: true };
  } catch (e) {
    console.error(`[Mail] Fehler beim Versand an ${to}:`, e);
    return { ok: false, error: explainMailError(e) };
  }
}

function explainMailError(e: unknown) {
  const err = e as { code?: string; responseCode?: number; response?: string; message?: string };
  const detail = err.response ?? err.message ?? "unbekannter Fehler";
  if (err.code === "EAUTH")
    return `Anmeldung beim Mailserver fehlgeschlagen – SMTP_USER/SMTP_PASS prüfen (bei GMX/web.de muss „POP3 und IMAP Zugriff erlauben“ aktiv sein). Antwort: ${detail}`;
  if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || err.code === "ESOCKET" || err.code === "EDNS")
    return `Mailserver nicht erreichbar – SMTP_HOST und SMTP_PORT prüfen. (${detail})`;
  if (err.responseCode && err.responseCode >= 500)
    return `Der Mailserver hat die Mail abgelehnt – stimmt MAIL_FROM mit SMTP_USER überein? Antwort: ${detail}`;
  return `Versand fehlgeschlagen: ${detail}`;
}

// ---------- Vorlagen ----------

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// Schlichtes, mail-taugliches Layout (Tabellen + Inline-Styles, funktioniert auch in Outlook)
function layout(title: string, body: string) {
  return `<!doctype html><html lang="de"><body style="margin:0;background:#f4f5f8;font-family:Arial,Helvetica,sans-serif;color:#171923">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:14px;font-weight:bold;color:#636a7c;padding-bottom:20px"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#e5383f;margin-right:6px"></span>Contenthaus</td></tr>
<tr><td style="font-size:22px;font-weight:bold;padding-bottom:16px">${escape(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.55">${body}</td></tr>
</table>
<p style="font-size:12px;color:#8c92a3;margin-top:16px">Diese Nachricht wurde automatisch vom Contenthaus-Portal verschickt.</p>
</td></tr></table></body></html>`;
}

function button(href: string, label: string) {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#3d5df5;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">${escape(label)}</a></p>`;
}

export function inviteMail(opts: { name: string; link: string; role: string; reset: boolean; hasVideos: boolean }) {
  const first = opts.name.split(" ")[0];
  if (opts.reset) {
    const subject = "Dein Link zum Passwort-Zurücksetzen";
    const html = layout(
      `Hallo ${first},`,
      `<p>hier ist dein Link, um ein neues Passwort für das Contenthaus-Portal festzulegen.</p>${button(opts.link, "Neues Passwort festlegen")}<p style="color:#636a7c;font-size:13px">Der Link ist 7 Tage gültig und funktioniert einmal. Falls du das nicht angefragt hast, kannst du diese Mail ignorieren.</p>`,
    );
    return { subject, html, text: `Hallo ${first},\n\nneues Passwort festlegen: ${opts.link}\n\nDer Link ist 7 Tage gültig.` };
  }
  const intro =
    opts.role === "cutter"
      ? "willkommen im Team! Im Contenthaus-Portal findest du deine Projekte, das Rohmaterial und lädst deine fertigen Videos hoch."
      : "willkommen bei Contenthaus! Im Portal lädst du dein Material hoch, verfolgst den Stand deiner Videos und lädst die fertigen Videos herunter.";
  const videos = opts.hasVideos ? "<p>Nach dem Klick wartet ein kurzes Video auf dich, das dir alles Wichtige zeigt.</p>" : "";
  const subject = "Willkommen bei Contenthaus – dein Zugang";
  const html = layout(
    `Hallo ${first},`,
    `<p>${intro}</p>${videos}${button(opts.link, "Zugang einrichten")}<p style="color:#636a7c;font-size:13px">Über den Button legst du dein Passwort fest. Der Link ist 7 Tage gültig.</p>`,
  );
  const text = `Hallo ${first},\n\n${intro}\n\nZugang einrichten: ${opts.link}\n\nDer Link ist 7 Tage gültig.`;
  return { subject, html, text };
}
