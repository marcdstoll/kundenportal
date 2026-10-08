"use client";

import { useSyncExternalStore } from "react";

// Liest das aktuelle Design direkt vom <html>-Element
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const getTheme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

// Umschalter zwischen hellem und dunklem Design (wird im Browser gespeichert)
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark");

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-muted transition-colors hover:bg-raised hover:text-text"
    >
      <span
        aria-hidden
        className="inline-block size-3.5 rounded-full border border-current"
        style={{ background: "linear-gradient(90deg, currentColor 50%, transparent 50%)" }}
      />
      {theme === "light" ? "Dunkles Design" : "Helles Design"}
    </button>
  );
}
