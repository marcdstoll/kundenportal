import Link from "next/link";
import { SignOutButton } from "@/app/dashboard/sign-out-button";

type Props = {
  user: { name: string; role: string };
};

// Kopfzeile mit Navigation je nach Rolle
export function TopBar({ user }: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
      <nav className="flex items-center gap-4 text-sm">
        <span className="font-semibold">Kundenportal</span>
        {(user.role === "kunde" || user.role === "admin") && (
          <Link href="/kunde" className="underline">
            Meine Aufträge
          </Link>
        )}
        {(user.role === "cutter" || user.role === "admin") && (
          <Link href="/board" className="underline">
            Board
          </Link>
        )}
      </nav>
      <div className="flex items-center gap-3 text-sm">
        <span>
          {user.name} · <span className="opacity-70">{user.role}</span>
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
