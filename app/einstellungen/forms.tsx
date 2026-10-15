"use client";

import { useState } from "react";
import { saveOnboardingVideos, sendTestMail } from "@/app/admin-actions";
import { buttonPrimary, buttonSecondary, inputField } from "@/app/components/ui";

export function OnboardingForm({ kunde, cutter }: { kunde: string; cutter: string }) {
  const [k, setK] = useState(kunde);
  const [c, setC] = useState(cutter);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await saveOnboardingVideos({ kunde: k, cutter: c });
        setBusy(false);
        setMsg(res.ok ? { ok: true, text: "Gespeichert ✓" } : { ok: false, text: res.error });
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Video für Kunden</span>
        <input
          className={inputField}
          placeholder="https://youtube.com/…"
          value={k}
          onChange={(e) => setK(e.target.value)}
          disabled={busy}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Video für Cutter</span>
        <input
          className={inputField}
          placeholder="https://youtube.com/…"
          value={c}
          onChange={(e) => setC(e.target.value)}
          disabled={busy}
        />
      </label>
      <div className="flex items-center justify-end gap-3">
        {msg && <span className={`text-sm ${msg.ok ? "text-[var(--st-online)]" : "text-danger"}`}>{msg.text}</span>}
        <button className={buttonPrimary} disabled={busy}>
          Speichern
        </button>
      </div>
    </form>
  );
}

export function TestMailButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={buttonSecondary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await sendTestMail();
          setBusy(false);
          setMsg(res.ok ? { ok: true, text: `Testmail an ${res.data.to} verschickt ✓` } : { ok: false, text: res.error });
        }}
      >
        Testmail an mich schicken
      </button>
      {msg && <span className={`text-sm ${msg.ok ? "text-[var(--st-online)]" : "text-danger"}`}>{msg.text}</span>}
    </div>
  );
}
