import Link from "next/link";

// Kleiner Link unter öffentlichen Seiten (Anmeldung, Einladung)
export function LegalFooter() {
  return (
    <p className="text-center text-xs text-muted">
      <Link href="/impressum" className="hover:text-text hover:underline">
        Impressum
      </Link>
    </p>
  );
}
