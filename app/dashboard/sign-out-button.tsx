"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-muted transition-colors hover:bg-raised/60 hover:text-text"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
    >
      Abmelden
    </button>
  );
}
