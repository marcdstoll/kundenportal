"use client";

import { useState } from "react";

// Schritt für Schritt: erst Begrüßung, dann Onboarding, dann Passwort
export function InviteSteps({ steps }: { steps: { title: string; body: React.ReactNode }[] }) {
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;
  return (
    <div className="space-y-4">
      {steps.length > 1 && (
        <ol className="flex items-center gap-2 text-xs text-muted" aria-label="Fortschritt">
          {steps.map((s, k) => (
            <li key={s.title} className="flex items-center gap-2">
              <span
                className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  k <= i ? "bg-accent text-accent-ink" : "bg-raised"
                }`}
              >
                {k + 1}
              </span>
              {k < steps.length - 1 && <span className="h-px w-6 bg-line" />}
            </li>
          ))}
        </ol>
      )}
      <h2 className="font-medium">{step.title}</h2>
      {step.body}
      {!last && (
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="text-sm text-muted hover:text-text" onClick={() => setI(steps.length - 1)}>
            Überspringen
          </button>
          <button
            type="button"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
            onClick={() => setI((x) => x + 1)}
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}
