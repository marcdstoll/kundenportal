"use client";

import { useState } from "react";

// Kleines Kopier-Symbol neben Links: kopiert den Text in die Zwischenablage, kurz ✓ als Bestätigung
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback ohne Clipboard-API (z. B. ältere Browser)
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={done ? "Kopiert" : "Link kopieren"}
      className={`inline-flex shrink-0 items-center justify-center rounded p-1 transition-colors hover:bg-raised ${
        done ? "text-[var(--st-online)]" : "text-muted hover:text-text"
      }`}
    >
      {done ? (
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}
