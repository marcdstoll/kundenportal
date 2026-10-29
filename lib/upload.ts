import { confirmUpload, requestUpload } from "@/app/actions";
import {
  finishOnboardingUpload,
  finishWelcomeUpload,
  startOnboardingUpload,
  startWelcomeUpload,
} from "@/app/admin-actions";

// Läuft im Browser: lädt eine Datei in Teilen direkt zu Frame.io hoch.
// Der Zugangsschlüssel bleibt auf dem Server; der Browser bekommt nur
// zeitlich begrenzte Upload-Links.

// Wackelige Verbindung: Ein Teil wird so lange erneut versucht, bis es 15 Minuten am Stück nicht geklappt hat.
// Meldet der Browser „offline“, wartet der Upload einfach auf das Netz (ohne Versuche zu verbrauchen).
// Hängt eine Verbindung, ohne abzubrechen (60 s kein Fortschritt), wird der Teil neu gestartet.
export const RETRY_WINDOW_MS = 15 * 60 * 1000;
const RETRY_DELAYS = [2000, 5000, 10000, 20000, 30000, 60000]; // danach jede Minute
const STALL_MS = 60 * 1000;
// Upload-Links von Frame.io gelten 24 Std. – zum Fortsetzen nur nutzen, solange sie sicher noch gültig sind
const RESUME_MAX_AGE_MS = 20 * 60 * 60 * 1000;

// Hinweis an die Anzeige, solange auf die Verbindung gewartet wird (null = läuft wieder normal)
export type WaitNotice = (text: string | null) => void;

// Stand einer Datei, um nach einem Abbruch bei den fehlenden Teilen weiterzumachen („Erneut versuchen“)
export type ResumeState = {
  fileRowId: string;
  mediaType: string;
  parts: { size: number; url: string }[];
  done: boolean[];
  createdAt: number;
};

// Link ungültig/abgelaufen o. Ä. – erneutes Senden desselben Teils hilft nicht
class FatalPartError extends Error {}

function putPartOnce(url: string, blob: Blob, mediaType: string, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stall: ReturnType<typeof setTimeout> | undefined;
    const watch = () => {
      clearTimeout(stall);
      stall = setTimeout(() => xhr.abort(), STALL_MS);
    };
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mediaType);
    xhr.setRequestHeader("x-amz-acl", "private");
    xhr.upload.onprogress = (e) => {
      watch();
      onProgress(e.loaded);
    };
    xhr.onload = () => {
      clearTimeout(stall);
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const msg = `Upload fehlgeschlagen (${xhr.status})`;
      // 4xx (außer Zeitüberschreitung/zu viele Anfragen): Link abgelaufen oder ungültig
      reject(xhr.status >= 400 && xhr.status < 500 && xhr.status !== 408 && xhr.status !== 429 ? new FatalPartError(msg) : new Error(msg));
    };
    xhr.onerror = () => {
      clearTimeout(stall);
      reject(new Error("Verbindung unterbrochen"));
    };
    xhr.onabort = () => reject(new Error("Verbindung hängt"));
    watch();
    xhr.send(blob);
  });
}

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

// Warten, bis die Pause um ist bzw. – wenn offline – bis das Netz zurück ist (höchstens bis Fristende).
// Neben dem „online“-Signal des Browsers wird alle 3 s selbst nachgesehen (das Signal kommt nicht immer).
function pause(ms: number) {
  return new Promise<void>((resolve) => {
    const offline = isOffline();
    const done = () => {
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener("online", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const poll = setInterval(() => offline && !isOffline() && done(), 3000);
    if (offline) window.addEventListener("online", done);
  });
}

// Einen Teil hochladen – bei Verbindungsproblemen bis zu 15 Minuten lang erneut versuchen
async function putPart(
  url: string,
  blob: Blob,
  mediaType: string,
  onProgress: (loaded: number) => void,
  onWait: WaitNotice,
  isStopped: () => boolean = () => false,
) {
  let since = 0; // Beginn der aktuellen Pechsträhne
  for (let attempt = 0; ; attempt++) {
    try {
      await putPartOnce(url, blob, mediaType, onProgress);
      if (since) onWait(null);
      return;
    } catch (e) {
      if (e instanceof FatalPartError || isStopped()) throw e;
      if (!since) since = Date.now();
      onProgress(0); // Fortschritt dieses Teils zurücksetzen
      const left = RETRY_WINDOW_MS - (Date.now() - since);
      if (left <= 0) {
        onWait(null);
        throw new Error(
          "Die Verbindung war 15 Minuten lang gestört. Bitte „Erneut versuchen“ – der Upload macht dort weiter, wo er abgebrochen ist.",
        );
      }
      onWait(
        isOffline()
          ? "Keine Internetverbindung – der Upload wartet und macht automatisch weiter."
          : "Verbindung unterbrochen – neuer Versuch läuft automatisch.",
      );
      // Offline: auf das Netz warten (zählt nicht als Versuch), sonst kurze, dann längere Pausen
      if (isOffline()) {
        attempt--;
        await pause(left);
      } else {
        await pause(Math.min(left, RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]));
      }
    }
  }
}

export async function uploadFile(
  jobId: string,
  kind: "roh" | "fertig",
  file: File,
  onProgress: (percent: number) => void,
  opts: { resume?: ResumeState; onState?: (s: ResumeState) => void; onWait?: WaitNotice } = {},
) {
  const onWait = opts.onWait ?? (() => {});
  // Fortsetzen nur, wenn die Upload-Links noch sicher gültig sind
  let state = opts.resume && Date.now() - opts.resume.createdAt < RESUME_MAX_AGE_MS ? opts.resume : undefined;

  for (let fresh = !state; ; fresh = true) {
    if (!state || fresh) {
      // 1. Upload-Links vom Server holen
      const res = await requestUpload(jobId, kind, { name: file.name, size: file.size });
      if (!res.ok) throw new Error(res.error);
      state = {
        fileRowId: res.data.fileRowId,
        // Der Content-Type muss zu dem passen, was Frame.io beim Anlegen erkannt hat
        mediaType: res.data.mediaType || file.type || "application/octet-stream",
        parts: res.data.parts,
        done: res.data.parts.map(() => false),
        createdAt: Date.now(),
      };
      opts.onState?.(state);
    }
    try {
      // 2.+3. In Teilen hochladen (schon fertige Teile überspringen)
      await uploadParts(state.parts, file, state.mediaType, onProgress, onWait, state.done);
      // 4. Dem Server melden, dass die Datei vollständig ist
      const done = await confirmUpload(state.fileRowId);
      if (!done.ok) {
        if (fresh) throw new Error(done.error);
        throw new FatalPartError(done.error); // z. B. inzwischen aufgeräumt → neu beginnen
      }
      return;
    } catch (e) {
      // Fortsetzen ging nicht (Link abgelaufen, Datei aufgeräumt) → die Datei einmal ganz neu hochladen
      if (e instanceof FatalPartError && !fresh) continue;
      throw e;
    }
  }
}

// Datei bzw. Aufnahme passend zu den Upload-Links in Teile schneiden und hochladen (max. 3 gleichzeitig)
async function uploadParts(
  parts: { size: number; url: string }[],
  file: Blob,
  mediaType: string,
  onProgress: (percent: number) => void,
  onWait: WaitNotice = () => {},
  done: boolean[] = parts.map(() => false),
) {
  const chunks: { url: string; blob: Blob }[] = [];
  let offset = 0;
  for (const part of parts) {
    chunks.push({ url: part.url, blob: file.slice(offset, offset + part.size) });
    offset += part.size;
  }

  const loaded = chunks.map((c, i) => (done[i] ? c.blob.size : 0));
  const report = () => {
    const total = loaded.reduce((a, b) => a + b, 0);
    onProgress(Math.min(100, Math.round((total / file.size) * 100)));
  };
  report();

  const todo = chunks.map((_, i) => i).filter((i) => !done[i]);
  let next = 0;
  let stopped = false; // ein Teil ist endgültig gescheitert → keine weiteren Teile mehr anfangen
  async function worker() {
    while (next < todo.length && !stopped) {
      const i = todo[next++];
      await putPart(
        chunks[i].url,
        chunks[i].blob,
        mediaType,
        (l) => {
          loaded[i] = l;
          report();
        },
        onWait,
        () => stopped,
      );
      loaded[i] = chunks[i].blob.size;
      done[i] = true;
      report();
    }
  }
  // Scheitert ein Teil endgültig, laufen die anderen gerade gesendeten Teile noch zu Ende (ihr Stand zählt
  // fürs Fortsetzen), danach wird der Fehler gemeldet
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(3, todo.length) }, () =>
      worker().catch((e) => {
        stopped = true;
        throw e;
      }),
    ),
  );
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => r.reason);
  if (errors.length) throw errors.find((e) => e instanceof FatalPartError) ?? errors[0];
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

// Onboarding-Video (für alle neuen Kunden bzw. Cutter) direkt zu Frame.io hochladen
export async function uploadOnboardingVideo(role: string, video: File, onProgress: (percent: number) => void) {
  const type = video.type.split(";")[0];
  const res = await startOnboardingUpload(role, { size: video.size, type, name: video.name });
  if (!res.ok) throw new Error(res.error);
  await uploadParts(res.data.parts, video, res.data.mediaType || type, onProgress);
  const done = await finishOnboardingUpload(role, res.data.fileId);
  if (!done.ok) throw new Error(done.error);
}
