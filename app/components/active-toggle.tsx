"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setActive } from "@/app/actions";

// Schalter "Aktiv" – Cutter für sich selbst, Admins für alle
export function ActiveToggle({ userId, active, editable }: { userId: string; active: boolean; editable: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(active);
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label="Aktiv"
      disabled={!editable || busy}
      onClick={async () => {
        const next = !value;
        setValue(next);
        setBusy(true);
        const res = await setActive(userId, next);
        setBusy(false);
        if (!res.ok) setValue(!next);
        router.refresh();
      }}
      className={`relative h-5 w-9 rounded-full transition-colors disabled:cursor-not-allowed ${
        value ? "bg-emerald-500/80" : "bg-raised"
      } ${!editable ? "opacity-60" : ""}`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${value ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}
