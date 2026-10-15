"use client";

import { useState } from "react";
import { markAllRead } from "@/app/actions";
import { buttonSecondary } from "@/app/components/ui";

export function MarkAllReadButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={buttonSecondary}
      onClick={async () => {
        setBusy(true);
        await markAllRead();
        setBusy(false);
      }}
    >
      Alle als gelesen markieren
    </button>
  );
}
