// Erlaubte Dateitypen für Rohmaterial (Briefing 02). Gilt im Browser und auf dem Server.
// Liste ergänzen: einfach Endung hier eintragen.
export const ALLOWED_EXTENSIONS = ["mp4", "mov", "wmv", "mp3", "wav", "jpg", "jpeg", "png"] as const;

// Für <input type="file" accept="…">: zeigt im Auswahlfenster nur diese Dateien an
export const ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

// Kurzer Hinweistext unter dem Upload-Feld
export const ALLOWED_LABEL = "MP4, MOV, WMV, MP3, WAV, JPG, PNG";

export function isAllowedFile(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return name.includes(".") && (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

// Unerlaubte Dateien still aussortieren (z. B. XML aus dem Kamera-Ordner)
export function filterAllowed<T extends { name: string }>(files: T[]) {
  const allowed = files.filter((f) => isAllowedFile(f.name));
  return { allowed, skipped: files.length - allowed.length };
}
