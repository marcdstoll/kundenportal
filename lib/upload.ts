import { confirmUpload, requestUpload } from "@/app/actions";
import { finishWelcomeUpload, startWelcomeUpload } from "@/app/admin-actions";

// Läuft im Browser: lädt eine Datei in Teilen direkt zu Frame.io hoch.
// Der Zugangsschlüssel bleibt auf dem Server; der Browser bekommt nur
// zeitlich begrenzte Upload-Links.

const RETRY_DELAYS = [2000, 5000, 10000, 20000, 30000]; // Pausen zwischen den Versuchen (ms)

function putPartOnce(url: string, blob: Blob, mediaType: string, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mediaType);
    xhr.setRequestHeader("x-amz-acl", "private");
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload fehlgeschlagen (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Verbindung unterbrochen"));
    xhr.send(blob);
  });
}

// Einen Teil hochladen – bei Fehlern bis zu 5-mal erneut versuchen
async function putPart(url: string, blob: Blob, mediaType: string, onProgress: (loaded: number) => void) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await putPartOnce(url, blob, mediaType, onProgress);
    } catch (err) {
      if (attempt >= RETRY_DELAYS.length) {
        throw new Error("Die Verbindung ist mehrfach abgebrochen – bitte erneut versuchen.");
      }
      onProgress(0); // Fortschritt dieses Teils zurücksetzen
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
}

export async function uploadFile(
  jobId: string,
  kind: "roh" | "fertig",
  file: File,
  onProgress: (percent: number) => void,
) {
  // 1. Upload-Links vom Server holen
  const res = await requestUpload(jobId, kind, { name: file.name, size: file.size });
  if (!res.ok) throw new Error(res.error);
  const { fileRowId, parts } = res.data;
  // Der Content-Type muss zu dem passen, was Frame.io beim Anlegen erkannt hat
  const mediaType = res.data.mediaType || file.type || "application/octet-stream";

  // 2.+3. In Teilen hochladen
  await uploadParts(parts, file, mediaType, onProgress);

  // 4. Dem Server melden, dass die Datei vollständig ist
  const done = await confirmUpload(fileRowId);
  if (!done.ok) throw new Error(done.error);
}

// Datei bzw. Aufnahme passend zu den Upload-Links in Teile schneiden und hochladen (max. 3 gleichzeitig)
async function uploadParts(
  parts: { size: number; url: string }[],
  file: Blob,
  mediaType: string,
  onProgress: (percent: number) => void,
) {
  const chunks: { url: string; blob: Blob }[] = [];
  let offset = 0;
  for (const part of parts) {
    chunks.push({ url: part.url, blob: file.slice(offset, offset + part.size) });
    offset += part.size;
  }

  const loaded = new Array(chunks.length).fill(0);
  const report = () => {
    const total = loaded.reduce((a, b) => a + b, 0);
    onProgress(Math.min(100, Math.round((total / file.size) * 100)));
  };

  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const i = next++;
      await putPart(chunks[i].url, chunks[i].blob, mediaType, (l) => {
        loaded[i] = l;
        report();
      });
      loaded[i] = chunks[i].blob.size;
      report();
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, worker));
}

// Persönliches Begrüßungsvideo (Webcam-Aufnahme) hochladen und der Person zuordnen – nur Admins
export async function uploadWelcomeVideo(userId: string, video: Blob, onProgress: (percent: number) => void) {
  const type = video.type.split(";")[0] || "video/webm";
  const res = await startWelcomeUpload(userId, { size: video.size, type });
  if (!res.ok) throw new Error(res.error);
  await uploadParts(res.data.parts, video, res.data.mediaType || type, onProgress);
  const done = await finishWelcomeUpload(userId, res.data.fileId);
  if (!done.ok) throw new Error(done.error);
}
