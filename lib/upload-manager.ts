"use client";

// Upload-Manager: hält alle Upload-Vorgänge im Browser-Tab – unabhängig davon, welche Seite gerade offen ist.
// Dadurch laufen Uploads beim Navigieren im Portal weiter, und man kann schon das nächste Projekt anlegen.
//
// - Vorgänge werden NACHEINANDER abgearbeitet (Projekt 1, dann Projekt 2 …) – das erste ist so am schnellsten fertig.
// - Solange etwas läuft: Lebenszeichen an den Server (sonst räumt er nach 30 Min. auf) und Nachfrage beim Schließen.
// - Wackelige Verbindung: bis zu 15 Min. automatisch weiterversuchen (Hinweis in „notice“), offline wird gewartet.
// - Bei einem Fehler bleiben die ausgewählten Dateien im Speicher → „Erneut versuchen“ lädt nur, was noch fehlt –
//   auch innerhalb einer Datei: schon hochgeladene Teile werden nicht noch einmal geschickt.
//
// Anzeigen lesen den Stand über useUploads() (React-Hook, siehe unten).

import { useSyncExternalStore } from "react";
import { createJob, discardUpload, submitForReview, submitJob, uploadHeartbeat, type NewJobInput } from "@/app/actions";
import { uploadFile, type ResumeState } from "@/lib/upload";

export type UploadFileState = { name: string; size: number; loaded: number; done: boolean };

export type Vorgang = {
  id: string;
  // projekt = neues Projekt, nachreichen = Material zum Projekt, review = fertiges Video des Cutters
  kind: "projekt" | "nachreichen" | "review";
  title: string;
  // Beschreibung („Inhalt“) beim neuen Projekt – wird unter dem Titel angezeigt
  description: string | null;
  jobId: string | null;
  files: UploadFileState[];
  status: "wartet" | "laeuft" | "fehler" | "fertig";
  error: string | null;
  // Hinweis während eines Verbindungsproblems (Upload läuft weiter bzw. wartet aufs Netz)
  notice?: string | null;
};

// Prozent über alle Dateien eines Vorgangs (nach Bytes)
export function percentOf(v: Vorgang) {
  const total = v.files.reduce((s, f) => s + f.size, 0);
  if (total === 0) return v.status === "fertig" ? 100 : 0;
  const loaded = v.files.reduce((s, f) => s + (f.done ? f.size : f.loaded), 0);
  return Math.min(100, Math.floor((loaded / total) * 100));
}

// ---------- interner Zustand ----------

const HEARTBEAT_MS = 2 * 60 * 1000; // Server räumt nach 30 Min. ohne Lebenszeichen auf
const REMOVE_DONE_AFTER_MS = 4000; // fertige Vorgänge kurz mit ✓ zeigen, dann ausblenden

let vorgaenge: Vorgang[] = [];
let snapshot: Vorgang[] = [];
const fileObjects = new Map<string, File[]>(); // Vorgang-ID → ausgewählte Dateien (nur im Speicher)
const projectInput = new Map<string, NewJobInput>();
const resumeStates = new Map<string, (ResumeState | undefined)[]>(); // Vorgang-ID → Fortsetzen-Stand je Datei
const listeners = new Set<() => void>();
const finishedListeners = new Set<(v: Vorgang) => void>();

let emitTimer: ReturnType<typeof setTimeout> | null = null;
function emit(now = false) {
  const flush = () => {
    emitTimer = null;
    snapshot = vorgaenge.map((v) => ({ ...v, files: v.files.map((f) => ({ ...f })) }));
    listeners.forEach((l) => l());
  };
  if (now) {
    if (emitTimer) clearTimeout(emitTimer);
    flush();
  } else if (!emitTimer) {
    emitTimer = setTimeout(flush, 250); // Fortschritt höchstens 4× pro Sekunde neu zeichnen
  }
}

function patch(id: string, change: Partial<Vorgang>, now = true) {
  vorgaenge = vorgaenge.map((v) => (v.id === id ? { ...v, ...change } : v));
  emit(now);
}

function patchFile(id: string, index: number, change: Partial<UploadFileState>) {
  const v = vorgaenge.find((x) => x.id === id);
  if (!v) return;
  const f = v.files[index];
  if (f) Object.assign(f, change);
  emit(false);
}

const isBusy = () => vorgaenge.some((v) => v.status === "wartet" || v.status === "laeuft");
// Für andere Teile der Seite (z. B. AutoRefresh): läuft gerade ein Upload?
export const uploadsBusy = isBusy;
// Lebenszeichen auch nach einem Fehler, solange der Vorgang noch da ist – sonst räumt der Server
// die halb hochgeladene Datei weg, bevor jemand „Erneut versuchen“ klickt
const needsHeartbeat = () => vorgaenge.some((v) => v.jobId && v.status !== "fertig");

// ---------- Warteschlange ----------

let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  startHeartbeat();
  try {
    for (;;) {
      const next = vorgaenge.find((v) => v.status === "wartet");
      if (!next) break;
      await runVorgang(next.id);
    }
  } finally {
    pumping = false;
    stopHeartbeatIfIdle();
  }
}

async function runVorgang(id: string) {
  patch(id, { status: "laeuft", error: null, notice: null });
  try {
    let v = vorgaenge.find((x) => x.id === id)!;
    const files = fileObjects.get(id) ?? [];

    // 1. Neues Projekt: erst anlegen (inkl. Ordner in Frame.io)
    if (v.kind === "projekt" && !v.jobId) {
      const created = await createJob(projectInput.get(id)!);
      if (!created.ok) throw new Error(created.error);
      patch(id, { jobId: created.data.jobId });
      v = vorgaenge.find((x) => x.id === id)!;
    }
    const jobId = v.jobId!;

    // 2. Dateien nacheinander hochladen – schon fertige überspringen, angefangene fortsetzen („Erneut versuchen“)
    const states = resumeStates.get(id) ?? [];
    resumeStates.set(id, states);
    for (let i = 0; i < files.length; i++) {
      if (vorgaenge.find((x) => x.id === id)?.files[i]?.done) continue;
      await uploadFile(
        jobId,
        v.kind === "review" ? "fertig" : "roh",
        files[i],
        (p) => patchFile(id, i, { loaded: Math.round((p / 100) * files[i].size) }),
        {
          resume: states[i],
          onState: (st) => (states[i] = st),
          onWait: (text) => {
            const cur = vorgaenge.find((x) => x.id === id);
            if (cur && cur.notice !== text) patch(id, { notice: text });
          },
        },
      );
      states[i] = undefined;
      patchFile(id, i, { done: true, loaded: files[i].size });
    }

    // 3. Neues Projekt abschicken → erscheint bei den Cuttern in „To Dos“
    if (v.kind === "projekt") {
      const submitted = await submitJob(jobId);
      if (!submitted.ok) throw new Error(submitted.error);
    }
    // Review-Video fertig → Projekt geht auf „Wartet auf Feedback“
    if (v.kind === "review") {
      const submitted = await submitForReview(jobId);
      if (!submitted.ok) throw new Error(submitted.error);
    }

    patch(id, { status: "fertig" });
    const done = vorgaenge.find((x) => x.id === id)!;
    finishedListeners.forEach((l) => l(done));
    fileObjects.delete(id);
    projectInput.delete(id);
    resumeStates.delete(id);
    setTimeout(() => remove(id), REMOVE_DONE_AFTER_MS);
  } catch (err) {
    // Angefangene Dateien behalten den Stand der fertigen Teile (dort macht „Erneut versuchen“ weiter)
    const states = resumeStates.get(id) ?? [];
    vorgaenge
      .find((x) => x.id === id)
      ?.files.forEach((f, i) => {
        if (f.done) return;
        const st = states[i];
        f.loaded = st ? st.parts.reduce((sum, part, k) => sum + (st.done[k] ? part.size : 0), 0) : 0;
      });
    patch(id, {
      status: "fehler",
      notice: null,
      error: err instanceof Error ? err.message : "Upload fehlgeschlagen.",
    });
  }
}

function remove(id: string) {
  vorgaenge = vorgaenge.filter((v) => v.id !== id);
  fileObjects.delete(id);
  projectInput.delete(id);
  resumeStates.delete(id);
  stopHeartbeatIfIdle();
  emit(true);
}

// ---------- Lebenszeichen & Nachfrage beim Schließen ----------

let heartbeat: ReturnType<typeof setInterval> | null = null;
function startHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    const ids = vorgaenge.filter((v) => v.jobId && v.status !== "fertig").map((v) => v.jobId!);
    if (ids.length) uploadHeartbeat(ids).catch(() => {});
  }, HEARTBEAT_MS);
}
function stopHeartbeatIfIdle() {
  if (heartbeat && !needsHeartbeat()) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (!isBusy()) return;
    e.preventDefault(); // Browser fragt: „Seite wirklich verlassen?“
    e.returnValue = "";
  });
}

// ---------- öffentliche Funktionen ----------

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const toState = (files: File[]) => files.map((f) => ({ name: f.name, size: f.size, loaded: 0, done: false }));

// Neues Projekt mit Dateien in die Warteschlange stellen – kehrt sofort zurück
export function startProjektUpload(input: NewJobInput, files: File[]) {
  const id = newId();
  fileObjects.set(id, files);
  projectInput.set(id, input);
  vorgaenge = [
    ...vorgaenge,
    {
      id,
      kind: "projekt",
      title: input.title,
      description: input.content.trim() || null,
      jobId: null,
      files: toState(files),
      status: "wartet",
      error: null,
    },
  ];
  emit(true);
  pump();
  return id;
}

// Material zu einem bestehenden Projekt nachreichen
export function startNachreichen(jobId: string, title: string, files: File[]) {
  const id = newId();
  fileObjects.set(id, files);
  vorgaenge = [
    ...vorgaenge,
    { id, kind: "nachreichen", title, description: null, jobId, files: toState(files), status: "wartet", error: null },
  ];
  emit(true);
  pump();
  return id;
}

// Fertiges Video zur Review hochladen (läuft weiter, auch wenn das Projekt-Panel geschlossen wird)
export function startReviewUpload(jobId: string, title: string, file: File) {
  const id = newId();
  fileObjects.set(id, [file]);
  vorgaenge = [
    ...vorgaenge,
    { id, kind: "review", title, description: null, jobId, files: toState([file]), status: "wartet", error: null },
  ];
  emit(true);
  pump();
  return id;
}

// Nach einem Fehler: am Ende der Warteschlange erneut starten (fertige Dateien werden übersprungen)
export function retryUpload(id: string) {
  const v = vorgaenge.find((x) => x.id === id);
  if (!v || v.status !== "fehler") return;
  vorgaenge = [...vorgaenge.filter((x) => x.id !== id), { ...v, status: "wartet", error: null }];
  emit(true);
  pump();
}

// Vorgang verwerfen: Entwurf bzw. halbe Dateien auf dem Server löschen
export async function discardVorgang(id: string) {
  const v = vorgaenge.find((x) => x.id === id);
  if (!v || v.status === "laeuft") return;
  remove(id);
  if (v.jobId) await discardUpload(v.jobId).catch(() => {});
}

export const uploadStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => snapshot,
  onFinished(listener: (v: Vorgang) => void) {
    finishedListeners.add(listener);
    return () => {
      finishedListeners.delete(listener);
    };
  },
};

const EMPTY: Vorgang[] = [];
export function useUploads() {
  return useSyncExternalStore(uploadStore.subscribe, uploadStore.get, () => EMPTY);
}
