"use client";

import { useState } from "react";

// Lädt mehrere Dateien nacheinander herunter (der Browser fragt evtl. einmal nach Erlaubnis)
export function DownloadAll({ fileIds }: { fileIds: string[] }) {
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    for (const id of fileIds) {
      const a = document.createElement("a");
      a.href = `/api/files/${id}?mode=download`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 900));
    }
    setBusy(false);
  }

  return (
    <button
      onClick={start}
      disabled={busy}
      className="rounded-md border border-line px-2.5 py-1 text-xs transition-colors hover:bg-raised disabled:opacity-50"
    >
      {busy ? "Downloads starten …" : `Alle ${fileIds.length} herunterladen`}
    </button>
  );
}
