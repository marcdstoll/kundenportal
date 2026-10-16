import { redirect } from "next/navigation";

// Die Inbox ist jetzt ein Aufklappfenster an der Glocke – alte Links führen zur Startseite
export default function InboxPage() {
  redirect("/dashboard");
}
