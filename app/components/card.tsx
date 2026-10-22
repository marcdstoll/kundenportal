// Einheitliche Karte für Profil- und Einstellungsseiten: Titel, kurze Erklärung, Inhalt
export function Card({
  title,
  description,
  danger = false,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`space-y-4 rounded-xl border bg-surface p-4 sm:p-5 ${danger ? "border-danger/30" : "border-line"}`}
      aria-label={title}
    >
      <div className="space-y-1">
        <h2 className={`font-medium ${danger ? "text-danger" : ""}`}>{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// Seitenrahmen für Profilseiten: eine Spalte, gut lesbare Breite
export function ProfileColumn({ children }: { children: React.ReactNode }) {
  return <div className="max-w-3xl space-y-4 px-4 pb-10 sm:px-6 md:px-10">{children}</div>;
}
