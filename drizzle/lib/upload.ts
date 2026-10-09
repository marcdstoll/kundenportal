import { confirmUpload, requestUpload } from "@/app/actions";

// Läuft im Browser: lädt eine Datei in Teilen direkt zu Frame.io hoch.
// Der Zugangsschlüssel bleibt auf dem Server; der Browser bekommt nur
// zeitlich begrenzte Upload-Links.

function putPart(
  url: string,
  blob: Blob,
  mediaType: string,
  onProgress: (loaded: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mediaType);
    xhr.setRequestHeader("x-amz-acl", "private");
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload fehlgeschlagen (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload"));
    xhr.send(blob);
  });
}

export async function uploadFile(
  jobId: string,
  kind: "roh" | "fertig",
  file: File,
  onProgress: (percent: number) => void
) {
  // 1. Upload-Links vom Server holen
  const res = await requestUpload(jobId, kind, { name: file.name, size: file.size });
  if (!res.ok) throw new Error(res.error);
  const { fileRowId, parts } = res.data;
  // Der Content-Type muss zu dem passen, was Frame.io beim Anlegen erkannt hat
  const mediaType = res.data.mediaType || file.type || "application/octet-stream";

  // 2. Datei passend zu den Links in Teile schneiden
  const chunks: { url: string; blob: Blob }[] = [];
  let offset = 0;
  for (const part of parts) {
    chunks.push({ url: part.url, blob: file.slice(offset, offset + part.size) });
    offset += part.size;
  }

  // 3. Teile hochladen (max. 3 gleichzeitig) und Fortschritt melden
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

  // 4. Dem Server melden, dass die Datei vollständig ist
  const done = await confirmUpload(fileRowId);
  if (!done.ok) throw new Error(done.error);
}
