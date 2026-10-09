"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setBilled } from "@/app/actions";

// Checkbox "Abgerechnet Cutter" – nur Admins können sie ändern
export function BilledToggle({ jobId, billed, editable }: { jobId: string; billed: boolean; editable: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(billed);
  const [busy, setBusy] = useState(false);

  return (
    <input
      type="checkbox"
      aria-label="Abgerechnet (Cutter)"
      className="size-4 accent-[var(--accent)] disabled:opacity-60"
      checked={value}
      disabled={!editable || busy}
      onChange={async (e) => {
        const next = e.target.checked;
        setValue(next);
        setBusy(true);
        const res = await setBilled(jobId, next);
        setBusy(false);
        if (!res.ok) setValue(!next);
        router.refresh();
      }}
    />
  );
}
