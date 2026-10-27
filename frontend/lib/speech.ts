"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";

// Tracked at module scope so stopSpeaking() can reach whatever is currently
// playing regardless of which component/closure started it — needed for the
// exam-integrity path, where leaving the exam has to cut audio immediately
// rather than letting an in-flight question or nudge finish speaking.
let currentAudio: HTMLAudioElement | null = null;

function speakBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    const done = () => {
      if (currentAudio === audio) currentAudio = null;
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

/** Immediately silences whatever speak() is currently playing, browser TTS
 * or the ElevenLabs audio element alike. The in-flight speak() promise is
 * intentionally left unresolved (pause() doesn't fire 'ended') — callers on
 * the exam-integrity path are already tearing the page down regardless. */
export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/** TTS via ElevenLabs, proxied through our backend so the API key never
 * reaches the browser. Falls back to the browser's built-in speechSynthesis
 * if the backend call fails (misconfigured key, network blip, ElevenLabs
 * outage) — a live exam should never go silent over a voice-provider issue.
 * `token` is whatever bearer credential the caller is authenticated with —
 * this module has no opinion on login JWT vs. an exam-attempt session token,
 * so it never reads one from storage itself (see /voice's dual-auth on the
 * backend, core/deps.get_current_user_or_attempt). */
export async function speak(text: string, token?: string): Promise<void> {
  try {
    const blob = await apiFetchBlob("/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      token,
    });
    await playBlob(blob);
  } catch {
    await speakBrowser(text);
  }
}

interface UseSpeechRecognitionResult {
  supported: boolean;
  listening: boolean;
  start: (options?: { resetTranscript?: boolean }) => void;
  stop: () => void;
}

const TRANSCRIBE_INTERVAL_MS = 4000;
const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/** STT via ElevenLabs: records continuously with MediaRecorder and re-
 * transcribes the whole accumulated buffer every few seconds, so callers see
 * a steadily growing transcript the same way they did with the old
 * browser-native continuous recognition — the public interface here is
 * unchanged on purpose so the exam page needed no changes. Unlike the old
 * Web Speech API, MediaRecorder doesn't silently stop itself after
 * prolonged silence, so the auto-reconnect path callers may still invoke
 * via `resetTranscript: false` is effectively a no-op here (kept only for
 * interface compatibility, since a genuinely dropped connection would need
 * a fresh recorder anyway). */
export function useSpeechRecognition(
  onTranscript: (text: string) => void,
  token?: string
): UseSpeechRecognitionResult {
  const [supported] = useState(
    () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"
  );
  const [listening, setListening] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcribingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const tokenRef = useRef(token);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const mimeType = useMemo(() => {
    if (typeof MediaRecorder === "undefined") return "";
    return CANDIDATE_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  }, []);

  const transcribeBuffer = useCallback(async () => {
    if (transcribingRef.current || chunksRef.current.length === 0) return;
    transcribingRef.current = true;
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      const form = new FormData();
      form.append("file", blob, "answer.webm");
      const result = await apiFetch<{ text: string }>("/voice/transcribe", {
        method: "POST",
        body: form,
        token: tokenRef.current,
      });
      onTranscriptRef.current(result.text);
    } catch {
      // Transient network/API failure — keep recording, retry next tick.
    } finally {
      transcribingRef.current = false;
    }
  }, [mimeType]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setListening(false);
  }, []);

  const start = useCallback(
    (options?: { resetTranscript?: boolean }) => {
      if (options?.resetTranscript !== false) {
        chunksRef.current = [];
        onTranscriptRef.current("");
      }
      if (!supported) return;

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          streamRef.current = stream;
          const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
          };
          recorder.start(1000);
          recorderRef.current = recorder;
          setListening(true);
          intervalRef.current = setInterval(transcribeBuffer, TRANSCRIBE_INTERVAL_MS);
        })
        .catch(() => {
          setListening(false);
        });
    },
    [supported, mimeType, transcribeBuffer]
  );

  useEffect(() => stop, [stop]);

  return { supported, listening, start, stop };
}
