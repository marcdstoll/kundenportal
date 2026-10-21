import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Impressum – Great Influence" };

// Impressum nach § 5 ECG, § 25 MedienG und § 63 GewO – öffentlich, auch ohne Anmeldung erreichbar
export default function ImpressumPage() {
  return <Content />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[13rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

async function Content() {
  const me = await getCurrentUser();
  // Angemeldet liegt die Seite schon im <main> des Rahmens (mit Seitenleiste)
  const Wrapper = me ? "div" : "main";
  return (
    <Wrapper className={`mx-auto w-full max-w-3xl space-y-8 px-4 pb-16 sm:px-6 ${me ? "pt-6 sm:pt-8 md:px-10" : "pt-10"}`}>
      {!me && (
        <div className="flex items-center justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- Logo aus /public, je nach Design hell oder dunkel */}
          <img src="/lightLogo.png" alt="Great Influence" className="logo-on-light h-8 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element -- Logo aus /public, je nach Design hell oder dunkel */}
          <img src="/darkLogo.png" alt="Great Influence" className="logo-on-dark h-8 w-auto" />
          <Link href="/login" className="text-sm text-accent hover:underline">
            Zur Anmeldung
          </Link>
        </div>
      )}
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Impressum</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Informationspflicht laut § 5 E-Commerce-Gesetz, § 63 Gewerbeordnung</h2>
        <dl className="space-y-3 text-sm">
          <Row label="Unternehmer">
            {LEGAL.owner}
            <span className="block text-muted">Einzelunternehmer“</span>
          </Row>
          <Row label="Anschrift">
            {LEGAL.street}
            <br />
            {LEGAL.city}, {LEGAL.country}
          </Row>
          <Row label="Kontakt">
            <a href={`mailto:${LEGAL.email}`} className="text-accent hover:underline">
              {LEGAL.email}
            </a>
            {LEGAL.phone && (
              <span className="block">
                Tel.:{" "}
                <a href={`tel:${LEGAL.phone.replace(/\s/g, "")}`} className="text-accent hover:underline">
                  {LEGAL.phone}
                </a>
              </span>
            )}
          </Row>
          <Row label="Unternehmensgegenstand (Gewerbewortlaut)">{LEGAL.trade}</Row>
          {LEGAL.uid && <Row label="UID-Nummer">{LEGAL.uid}</Row>}
          {LEGAL.gisa && <Row label="GISA-Zahl">{LEGAL.gisa}</Row>}
          <Row label="Gewerbebehörde">{LEGAL.authority}</Row>
          <Row label="Kammerzugehörigkeit">Mitglied der {LEGAL.chamber}</Row>
          <Row label="Berufsrecht">
            Gewerbeordnung (GewO), abrufbar unter{" "}
            <a href="https://www.ris.bka.gv.at" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              www.ris.bka.gv.at
            </a>
          </Row>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Offenlegung laut § 25 Mediengesetz</h2>
        <dl className="space-y-3 text-sm">
          <Row label="Medieninhaber">
            {LEGAL.owner}, {LEGAL.city}
          </Row>
          <Row label="Grundlegende Richtung">
            Kundenportal von {LEGAL.brand} zur Abwicklung von Videoprojekten (Upload von Material, Abstimmung und
            Freigabe von Videos).
          </Row>
        </dl>
      </section>
    </Wrapper>
  );
}
