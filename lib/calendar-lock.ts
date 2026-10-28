import { CUSTOMER_DATE_STATUSES } from "@/lib/status";

// Termine im Kalender verschieben: Admins immer, Kunden ihre eigenen Projekte ab "Ready to post", Cutter nie.
// Liefert je Projekt null = darf verschieben, sonst den Grund, warum nicht (erscheint als Hinweis am Termin)
export function calendarLockReason(me: { role: string; customerId?: string | null }) {
  return (job: { customerId: string; status: string }) => {
    if (me.role === "admin") return null;
    if (me.role === "cutter") return "Termine verschieben nur Admins und Kunden.";
    if (job.customerId !== me.customerId) return "Nur eigene Projekte lassen sich verschieben.";
    if (!CUSTOMER_DATE_STATUSES.includes(job.status)) return "Das Datum lässt sich ab „Ready to post“ ändern.";
    return null;
  };
}
