// Auswahlfenster (Dropdowns) im sichtbaren Bereich halten – als ref-Callback am Fenster verwenden:
//   <div ref={keepInViewport} className="absolute right-0 top-full …">
// Ragt das Fenster links bzw. rechts aus dem Bildschirm, klappt es zur anderen Seite des Knopfs um;
// passt es auch dann nicht, wird es so verschoben, dass es mit 8 px Abstand zum Rand komplett sichtbar ist.
const MARGIN = 8;

export function keepInViewport(el: HTMLElement | null) {
  if (!el || typeof window === "undefined") return;
  const vw = document.documentElement.clientWidth;
  el.style.maxWidth = `${vw - 2 * MARGIN}px`;
  el.style.transform = "";

  let r = el.getBoundingClientRect();
  if (r.left < MARGIN) {
    // links abgeschnitten → am linken Rand des Knopfs ausrichten, öffnet nach rechts
    el.style.left = "0";
    el.style.right = "auto";
  } else if (r.right > vw - MARGIN) {
    // rechts abgeschnitten → am rechten Rand des Knopfs ausrichten, öffnet nach links
    el.style.right = "0";
    el.style.left = "auto";
  } else {
    return;
  }

  r = el.getBoundingClientRect();
  const shift = r.left < MARGIN ? MARGIN - r.left : r.right > vw - MARGIN ? vw - MARGIN - r.right : 0;
  if (shift) el.style.transform = `translateX(${Math.round(shift)}px)`;
}
