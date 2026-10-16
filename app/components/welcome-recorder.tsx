"use client";

// Persönliches Begrüßungsvideo mit der Webcam aufnehmen.
// Ablauf: Kamera & Mikrofon freigeben → Bild und Pegel prüfen → 3-2-1 → Aufnahme → ansehen →
// verwerfen (und neu aufnehmen) oder übernehmen. Die fertige Aufnahme geht als Blob an onAccept.

import { useEffect, useRef, useState } from "react";
import { buttonPrimary, buttonSecondary } from "./ui";

const MAX_SECONDS = 180;

type Phase = "start" | "live" | "countdown" | "recording" | "review";

// Bestes Format, das der Browser aufnehmen kann – MP4 bevorzugt (läuft überall, auch auf iPhones)
function pickMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

function mediaError(e: unknown) {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Der Zugriff auf Kamera bzw. Mikrofon wurde blockiert. Erlaube ihn über das Symbol in der Adressleiste und versuch es erneut.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "Es wurde keine Kamera oder kein Mikrofon gefunden.";
  if (name === "NotReadableError") return "Kamera oder Mikrofon werden gerade von einem anderen Programm benutzt.";
  return "Kamera konnte nicht gestartet werden.";
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function WelcomeRecorder({
  onAccept,
  onCancel,
  acceptLabel = "Video übernehmen",
}: {
  onAccept: (video: Blob) => void;
  onCancel: () => void;
  acceptLabel?: string;
}) {
  const [phase, setPhase] = useState<Phase>("start");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [micId, setMicId] = useState("");
  const [level, setLevel] = useState(0);
  const [micHeard, setMicHeard] = useState(false);
  const [count, setCount] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState<{ blob: Blob; url: string } | null>(null);

  const liveRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // Kamera starten (oder auf ein anderes Gerät umschalten)
  async function startCamera(nextCameraId = cameraId, nextMicId = micId) {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Die Kamera funktioniert nur, wenn das Portal über https:// aufgerufen wird.");
      return;
    }
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(nextCameraId ? { deviceId: { exact: nextCameraId } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          ...(nextMicId ? { deviceId: { exact: nextMicId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      stream?.getTracks().forEach((t) => t.stop());
      setStream(next);
      setMicHeard(false);
      // Erst nach der Freigabe liefert der Browser die Gerätenamen
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
      setMics(devices.filter((d) => d.kind === "audioinput"));
      setCameraId(next.getVideoTracks()[0]?.getSettings().deviceId ?? "");
      setMicId(next.getAudioTracks()[0]?.getSettings().deviceId ?? "");
      setPhase((p) => (p === "start" ? "live" : p));
    } catch (e) {
      setError(mediaError(e));
    }
  }

  // Livebild in das Video-Element hängen
  useEffect(() => {
    if (liveRef.current && stream) liveRef.current.srcObject = stream;
  }, [stream, phase]);

  // Mikrofon-Pegel messen, damit man sieht, dass Ton ankommt
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      const value = Math.min(1, rms * 4);
      setLevel(value);
      if (value > 0.08) setMicHeard(true);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      ctx.close().catch(() => {});
    };
  }, [stream]);

  // Beim Schließen Kamera und Mikrofon wieder ausschalten
  useEffect(() => {
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

  function beginRecording() {
    if (!stream) return;
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2_500_000 });
    } catch {
      setError("Dieser Browser kann leider keine Videos aufnehmen. Bitte Chrome, Edge oder Safari verwenden.");
      setPhase("live");
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: (recorder.mimeType || mimeType || "video/webm").split(";")[0] });
      setRecording({ blob, url: URL.createObjectURL(blob) });
      setPhase("review");
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setSeconds(0);
    setPhase("recording");
  }

  // Countdown 3-2-1, dann Aufnahme starten
  useEffect(() => {
    if (phase !== "countdown") return;
    const t = setTimeout(() => (count <= 1 ? beginRecording() : setCount(count - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count]);

  // Laufzeit zählen und bei der Höchstdauer automatisch stoppen
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (phase === "recording" && seconds >= MAX_SECONDS) recorderRef.current?.stop();
  }, [phase, seconds]);

  // Vorschau-URL wieder freigeben
  useEffect(() => {
    return () => {
      if (recording) URL.revokeObjectURL(recording.url);
    };
  }, [recording]);

  function discard() {
    setRecording(null);
    setSeconds(0);
    setPhase("live");
  }

  const hasAudio = !!stream && stream.getAudioTracks().length > 0;

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
      {phase === "start" && (
        <div className="space-y-3 p-2 text-sm">
          <p className="text-muted">Kamera und Mikrofon werden eingeschaltet, sobald du auf den Button klickst.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonPrimary} onClick={() => startCamera()}>
              Kamera einschalten
            </button>
            <button type="button" className={buttonSecondary} onClick={onCancel}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {(phase === "live" || phase === "countdown" || phase === "recording") && (
        <>
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video
              ref={liveRef}
              autoPlay
              muted
              playsInline
              className="aspect-video w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
              aria-label="Kamerabild"
            />
            {phase === "countdown" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-7xl font-semibold text-white">
                {count}
              </div>
            )}
            {phase === "recording" && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
                <span className="rec-dot size-2.5 rounded-full bg-rec" aria-hidden />
                {fmt(seconds)} / {fmt(MAX_SECONDS)}
              </div>
            )}
          </div>

          {/* Mikrofon-Check */}
          <div className="flex items-center gap-3 text-xs">
            <span aria-hidden>🎙️</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden>
              <div
                className="h-full bg-[var(--st-online)] transition-[width] duration-75"
                style={{ width: `${level * 100}%` }}
              />
            </div>
            <span className={!hasAudio ? "text-danger" : micHeard ? "text-[var(--st-online)]" : "text-muted"}>
              {!hasAudio ? "Kein Mikrofon" : micHeard ? "Mikrofon erkannt ✓" : "Sag etwas zum Testen"}
            </span>
          </div>

          {phase === "live" && (
            <>
              {(cameras.length > 1 || mics.length > 1) && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {cameras.length > 1 && (
                    <select
                      className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
                      value={cameraId}
                      aria-label="Kamera"
                      onChange={(e) => {
                        setCameraId(e.target.value);
                        startCamera(e.target.value, micId);
                      }}
                    >
                      {cameras.map((c, i) => (
                        <option key={c.deviceId} value={c.deviceId}>
                          {c.label || `Kamera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                  {mics.length > 1 && (
                    <select
                      className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
                      value={micId}
                      aria-label="Mikrofon"
                      onChange={(e) => {
                        setMicId(e.target.value);
                        startCamera(cameraId, e.target.value);
                      }}
                    >
                      {mics.map((m, i) => (
                        <option key={m.deviceId} value={m.deviceId}>
                          {m.label || `Mikrofon ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={buttonSecondary} onClick={onCancel}>
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="rounded-md bg-rec px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  onClick={() => {
                    setCount(3);
                    setPhase("countdown");
                  }}
                >
                  ● Aufnahme starten
                </button>
              </div>
            </>
          )}

          {phase === "recording" && (
            <div className="flex justify-end">
              <button type="button" className={buttonPrimary} onClick={() => recorderRef.current?.stop()}>
                ■ Aufnahme beenden
              </button>
            </div>
          )}
        </>
      )}

      {phase === "review" && recording && (
        <>
          <video
            src={recording.url}
            controls
            playsInline
            className="aspect-video w-full rounded-lg bg-black"
            aria-label="Aufnahme ansehen"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={buttonSecondary} onClick={discard}>
              Verwerfen & neu aufnehmen
            </button>
            <button
              type="button"
              className={buttonPrimary}
              onClick={() => {
                stream?.getTracks().forEach((t) => t.stop());
                onAccept(recording.blob);
              }}
            >
              {acceptLabel}
            </button>
          </div>
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

// Gespeichertes Begrüßungsvideo abspielen (kommt über /api/welcome von Frame.io)
export function WelcomePlayer({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-line bg-raised p-4 text-center text-sm text-muted">
        Das Video wird gerade noch vorbereitet.
        <button type="button" className={buttonSecondary} onClick={() => setFailed(false)}>
          Nochmal versuchen
        </button>
      </div>
    );
  }
  return (
    <video
      src={src}
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className="aspect-video w-full rounded-lg border border-line bg-black"
      aria-label="Begrüßungsvideo"
    />
  );
}
