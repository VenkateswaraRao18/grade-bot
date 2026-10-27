"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  FileText,
  Maximize,
  Mic,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import { apiFetch, apiFetchJson, ApiError } from "@/lib/api";
import { getExamSessionToken } from "@/lib/examSession";
import { speak, stopSpeaking, useSpeechRecognition } from "@/lib/speech";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CameraCapture } from "@/components/exam/CameraCapture";
import { FaceWithIdSample } from "@/components/exam/FaceWithIdSample";
import { SourceExcerpt } from "@/components/exam/SourceExcerpt";
import { cn } from "@/lib/cn";

type OrbState = "idle" | "speaking" | "listening" | "thinking";

// Replaced the animated orb with a plain status label on request — the orb
// went through several rounds of animation bugs (color crossfade, scale
// snaps, a full remount on every question) and the simplest fix for all of
// them at once was removing the thing that could break, not patching it
// further.
const STATUS_LABEL: Record<OrbState, string> = {
  idle: "Ready when you are",
  speaking: "Speaking…",
  listening: "Listening…",
  thinking: "Thinking…",
};

const STATUS_COLOR: Record<OrbState, string> = {
  idle: "text-zinc-500",
  speaking: "text-sky-400",
  listening: "text-emerald-400",
  thinking: "text-zinc-400",
};

interface NextQuestion {
  finished: boolean;
  question_id: string | null;
  sequence: number | null;
  text: string | null;
  difficulty: string | null;
  is_followup: boolean | null;
  is_generalization: boolean | null;
  is_graded: boolean | null;
  graded_sequence: number | null;
  source_excerpt: string | null;
  highlight_terms: string[] | null;
  thinking_time_seconds: number | null;
  time_remaining_seconds: number;
  closing_message: string | null;
}

interface AttemptStatusOut {
  status: string;
  time_remaining_seconds: number;
  questions_asked: number;
  max_questions: number;
}

type Stage = "gate" | "exam" | "closing" | "end_photo" | "violation" | "complete";

const OPENING_LINE =
  "Hello, and welcome. I'll be asking you a series of questions about your submitted work — " +
  "take your time, answer in your own words, and let's begin.";

const LISTEN_START_DELAY_MS = 1500;
const NUDGE_INTERVAL_MS = 8000;
const NUDGE_PHRASES = [
  "Are you still there?",
  "Take your time — are you still thinking about this one?",
  "I'll move on to the next question if I don't hear from you.",
];
const NO_ANSWER_MARKER = "(No response — student did not answer within the time given.)";
// Independent of the nudge/reset cycle above: a student saying a stray word
// every ~45s would otherwise reset the silence counter indefinitely and
// could burn arbitrary exam time on one question. This is a flat ceiling
// per question regardless of nudge activity — a placeholder default to
// tune later with real classroom data, not a considered final number.
const HARD_QUESTION_TIME_LIMIT_MS = 3 * 60 * 1000;

// Short utterances that mean "I didn't catch that, please repeat" rather
// than an actual answer. Matched against SHORT transcripts only (see
// looksLikeRepeatRequest) so a real answer that happens to contain "again"
// mid-sentence is never misread as a repeat request.
const REPEAT_PATTERNS = [
  /\brepeat\b/i,
  /say (that|it) again/i,
  /what was the question/i,
  /come again/i,
  /didn'?t (catch|hear|get) that/i,
  /one more time/i,
  /pardon/i,
  /\bhuh\?*$/i,
  /sorry,?\s*(what|come again)/i,
];

function looksLikeRepeatRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.split(/\s+/).length > 12) return false;
  return REPEAT_PATTERNS.some((re) => re.test(trimmed));
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LiveExamPage(props: PageProps<"/exam/[attemptId]">) {
  const { attemptId } = use(props.params);
  const [sessionToken] = useState(() => getExamSessionToken(attemptId));
  const [answer, setAnswer] = useState("");
  const speech = useSpeechRecognition(handleTranscript, sessionToken ?? undefined);

  const [stage, setStage] = useState<Stage>("gate");
  const [fullscreenSupported] = useState(
    () => typeof document !== "undefined" && !!document.documentElement.requestFullscreen
  );
  const [question, setQuestion] = useState<NextQuestion | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [thinkingSecondsLeft, setThinkingSecondsLeft] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [maxQuestions, setMaxQuestions] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeNudge, setActiveNudge] = useState<string | null>(null);
  const [repeating, setRepeating] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const hasStartedRef = useRef(false);
  const hasSpokenRef = useRef<string | null>(null);
  const hasGreetedRef = useRef(false);
  const submittedQuestionIdRef = useRef<string | null>(null);
  const answerRef = useRef("");
  const lastAnswerSnapshotRef = useRef("");
  const listenStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardCapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeCountRef = useRef(0);
  const handlingRepeatRef = useRef(false);
  const endedRef = useRef(false);
  const speechStartRef = useRef(speech.start);
  speechStartRef.current = speech.start;

  answerRef.current = answer;

  const applyNextQuestion = useCallback((q: NextQuestion) => {
    setTimeRemaining(q.time_remaining_seconds);
    if (q.finished) {
      setQuestion(null);
      if (q.closing_message) {
        setStage("closing");
        speakText(q.closing_message, () => setStage("end_photo"));
      } else {
        setStage("end_photo");
      }
    } else {
      setQuestion(q);
      setAnswer("");
      setThinkingSecondsLeft(q.thinking_time_seconds ?? 0);
    }
  }, []);

  const applyLoadError = useCallback((err: unknown) => {
    setError(err instanceof ApiError ? err.message : "Could not load the next question.");
  }, []);

  // Fetches the next question purely (no state writes) so this can be called
  // both from the stage-transition effect and from the submit handler.
  const fetchNextQuestion = useCallback(() => {
    return apiFetch<NextQuestion>(`/attempts/${attemptId}/next-question`, { token: sessionToken ?? undefined });
  }, [attemptId, sessionToken]);

  // Only starts fetching once the student has passed the full-screen gate —
  // no timer/question activity before that (CLAUDE.md §6 spirit: nothing
  // exam-related happens before the deliberate "begin" action).
  useEffect(() => {
    if (!sessionToken || stage !== "exam" || hasStartedRef.current) return;
    hasStartedRef.current = true;
    setLoadingQuestion(true);
    fetchNextQuestion().then(applyNextQuestion).catch(applyLoadError).finally(() => setLoadingQuestion(false));
  }, [sessionToken, stage, fetchNextQuestion, applyNextQuestion, applyLoadError]);

  function speakText(text: string, onDone?: () => void) {
    setIsSpeaking(true);
    speak(text, sessionToken ?? undefined).finally(() => {
      setIsSpeaking(false);
      onDone?.();
    });
  }

  function clearTimers() {
    if (listenStartTimerRef.current) {
      clearTimeout(listenStartTimerRef.current);
      listenStartTimerRef.current = null;
    }
    if (nudgeTimerRef.current) {
      clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
    if (hardCapTimerRef.current) {
      clearTimeout(hardCapTimerRef.current);
      hardCapTimerRef.current = null;
    }
    nudgeCountRef.current = 0;
    setActiveNudge(null);
  }

  // Dynamic no-dead-air interaction: since the mic listens automatically and
  // continuously (no push-to-talk button), "silence" can't be detected from
  // listening state alone — it's detected from the transcript not growing
  // over a 15s window. Growth resets the strike count (the student is
  // actively answering); no growth for 3 windows in a row triggers auto-skip.
  function scheduleNudgeCheck(onExhausted: () => void) {
    lastAnswerSnapshotRef.current = answerRef.current;
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    nudgeTimerRef.current = setTimeout(() => {
      const grew = answerRef.current.trim().length > lastAnswerSnapshotRef.current.trim().length;
      if (grew) {
        nudgeCountRef.current = 0;
        setActiveNudge(null);
        scheduleNudgeCheck(onExhausted);
        return;
      }

      if (nudgeCountRef.current < NUDGE_PHRASES.length) {
        const phrase = NUDGE_PHRASES[nudgeCountRef.current];
        nudgeCountRef.current += 1;
        setActiveNudge(phrase);
        speakText(phrase);
        scheduleNudgeCheck(onExhausted);
      } else {
        onExhausted();
      }
    }, NUDGE_INTERVAL_MS);
  }

  function beginListeningCycle(onExhausted: () => void) {
    listenStartTimerRef.current = setTimeout(() => {
      speechStartRef.current({ resetTranscript: true });
    }, LISTEN_START_DELAY_MS);
    scheduleNudgeCheck(onExhausted);
    // Hard ceiling, independent of nudge resets — see constant comment.
    hardCapTimerRef.current = setTimeout(() => {
      submitAnswer(answerRef.current.trim() || NO_ANSWER_MARKER);
    }, HARD_QUESTION_TIME_LIMIT_MS);
  }

  async function submitAnswer(text: string) {
    if (!question?.question_id) return;
    // Synchronous re-entrancy guard, keyed to this question's id — the
    // silence-exhaustion auto-submit (beginListeningCycle's nudge/hard-cap
    // timers) and a manual button click can fire within the same tick of
    // each other, and React's `submitting` state can't block that since it
    // only takes effect after a re-render. A ref check here is immediate.
    if (submittedQuestionIdRef.current === question.question_id) return;
    submittedQuestionIdRef.current = question.question_id;
    setSubmitting(true);
    setError(null);
    clearTimers();
    speech.stop();
    try {
      await apiFetchJson(
        `/attempts/${attemptId}/responses`,
        { question_id: question.question_id, transcript_text: text },
        { token: sessionToken ?? undefined }
      );
      setLoadingQuestion(true);
      const q = await fetchNextQuestion();
      applyNextQuestion(q);
    } catch (err) {
      // A 400 "already answered" means some other in-flight call (the race
      // above, or a stale retry) already recorded a response for this
      // question — the honest recovery is to move on to the next question,
      // not leave the student stuck looking at an error for something that
      // isn't actually broken.
      if (err instanceof ApiError && err.status === 400) {
        try {
          setLoadingQuestion(true);
          const q = await fetchNextQuestion();
          applyNextQuestion(q);
        } catch (err2) {
          setError(err2 instanceof ApiError ? err2.message : "Could not load the next question.");
        }
      } else {
        setError(err instanceof ApiError ? err.message : "Could not submit your answer.");
      }
    } finally {
      setSubmitting(false);
      setLoadingQuestion(false);
    }
  }

  // A student saying "can you repeat that?" instead of answering shouldn't
  // be graded as their answer, and the examiner shouldn't try to engage
  // with it conversationally — it's handled entirely client-side: replay
  // the question audio, wipe the transcript, and resume listening. This is
  // deliberately narrow (short utterances matching a fixed pattern list)
  // rather than an LLM classification call, so it's instant and can't be
  // talked into doing anything other than repeating the question. Checked
  // at the transcript source (not via an effect watching `answer`) so the
  // state updates below happen in a normal event handler, not an effect body.
  function handleRepeatRequest() {
    if (!question) return;
    handlingRepeatRef.current = true;
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    if (listenStartTimerRef.current) clearTimeout(listenStartTimerRef.current);
    nudgeCountRef.current = 0;
    setActiveNudge(null);
    setRepeating(true);
    setAnswer("");
    speech.stop();

    speakText(question.text ?? "", () => {
      setRepeating(false);
      handlingRepeatRef.current = false;
      beginListeningCycle(() => submitAnswer(NO_ANSWER_MARKER));
    });
  }

  function handleTranscript(text: string) {
    if (
      stage === "exam" &&
      question &&
      !loadingQuestion &&
      !submitting &&
      !handlingRepeatRef.current &&
      looksLikeRepeatRequest(text)
    ) {
      handleRepeatRequest();
      return;
    }
    setAnswer(text);
  }

  // Speak each new question aloud exactly once. The very first question of
  // the attempt is preceded by a short spoken opening, so the exam feels
  // like it's being conducted rather than just firing off a question list.
  // Once done, automatically start listening after a short beat (no
  // push-to-talk), then start the silence check-in cycle.
  useEffect(() => {
    if (stage === "exam" && question?.question_id && hasSpokenRef.current !== question.question_id) {
      hasSpokenRef.current = question.question_id;
      clearTimers();
      const askQuestion = () => speakText(question.text ?? "", () => beginListeningCycle(() => submitAnswer(NO_ANSWER_MARKER)));
      if (!hasGreetedRef.current) {
        hasGreetedRef.current = true;
        speakText(OPENING_LINE, askQuestion);
      } else {
        askQuestion();
      }
    }
    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, question?.question_id]);

  // Thinking-time countdown (local, cosmetic — gates the submit button only).
  useEffect(() => {
    if (thinkingSecondsLeft <= 0) return;
    const t = setTimeout(() => setThinkingSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [thinkingSecondsLeft]);

  // Local ticking clock between authoritative server polls.
  useEffect(() => {
    if (timeRemaining === null || stage !== "exam") return;
    const t = setTimeout(() => setTimeRemaining((s) => (s !== null ? Math.max(0, s - 1) : s)), 1000);
    return () => clearTimeout(t);
  }, [timeRemaining, stage]);

  // Continuous recognition can be stopped by the browser on its own (a known
  // quirk after prolonged silence). Since there's no manual mic button to
  // restart it, treat an unexpected stop as transient and resume listening —
  // otherwise the student would silently stop being heard mid-question.
  const wasListeningRef = useRef(false);
  useEffect(() => {
    const stoppedUnexpectedly =
      wasListeningRef.current && !speech.listening && stage === "exam" && !!question && !loadingQuestion && !submitting;
    wasListeningRef.current = speech.listening;
    if (!stoppedUnexpectedly) return;
    const t = setTimeout(() => speechStartRef.current({ resetTranscript: false }), 500);
    return () => clearTimeout(t);
  }, [speech.listening, stage, question, loadingQuestion, submitting]);

  // Poll the server as the source of truth for time remaining (CLAUDE.md §6).
  useEffect(() => {
    if (!sessionToken || stage !== "exam") return;
    const interval = setInterval(async () => {
      try {
        const s = await apiFetch<AttemptStatusOut>(`/attempts/${attemptId}/status`, {
          token: sessionToken ?? undefined,
        });
        setTimeRemaining(s.time_remaining_seconds);
        setMaxQuestions(s.max_questions);
        if (s.status === "completed") {
          setStage("complete");
          setQuestion(null);
        }
      } catch {
        // heartbeat failure is non-fatal; next tick retries
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [sessionToken, stage, attemptId]);

  const endDueToViolation = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearTimers();
    speech.stop();
    stopSpeaking();
    setShowExitConfirm(false);
    setStage("violation");
    apiFetchJson(
      `/attempts/${attemptId}/finish`,
      { reason: "integrity_violation" },
      { token: sessionToken ?? undefined }
    ).catch(() => {
      // best-effort — the server-side timer/expiry check is the real backstop
    });
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, sessionToken]);

  function confirmExitAndEnd() {
    endDueToViolation();
  }

  async function cancelExitAndResume() {
    setShowExitConfirm(false);
    if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // couldn't reclaim full-screen — exam continues in the normal
        // window rather than getting stuck on a dialog with no way out
      }
    }
    if (question) {
      beginListeningCycle(() => submitAnswer(answerRef.current.trim() || NO_ANSWER_MARKER));
    }
  }

  // The integrity check this was built for: once the exam is underway,
  // leaving full-screen or switching away from this tab is an integrity
  // event. Switching tabs/minimizing ends the attempt immediately (the
  // student can't see a confirmation dialog while they're elsewhere, and
  // leaving deliberately to check something is a clearer signal than an
  // accidental key press). Leaving full-screen — most commonly just hitting
  // Escape out of habit — asks first instead of ending on the spot: audio
  // and listening are cut immediately either way, so nothing keeps running
  // in the background while the student decides. Only attached once
  // actually in the "exam" stage, so the full-screen gate transition itself
  // can't self-trigger this.
  useEffect(() => {
    if (stage !== "exam") return;
    function handleFullscreenChange() {
      if (document.fullscreenElement || showExitConfirm) return;
      clearTimers();
      speech.stop();
      stopSpeaking();
      setShowExitConfirm(true);
    }
    function handleVisibilityChange() {
      if (document.hidden) endDueToViolation();
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, showExitConfirm, endDueToViolation]);

  async function enterExam() {
    setError(null);
    if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // Fullscreen denied/unsupported in practice (some mobile browsers
        // advertise the API but reject the call) — proceed without the
        // integrity lock rather than blocking the student from their exam.
      }
    }
    setStage("exam");
  }

  if (!sessionToken) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
          <ShieldAlert className="h-7 w-7 text-red-400" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-white">This exam session isn&apos;t valid</h1>
        <p className="mt-2 max-w-sm text-sm text-zinc-400">
          Use the exam link your instructor gave you, and go through the passcode and ID steps again — this
          page can&apos;t be opened directly.
        </p>
      </div>
    );
  }

  async function handleEndPhotoCaptured(file: File) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiFetch(`/attempts/${attemptId}/end-photo`, {
        method: "POST",
        body: formData,
        token: sessionToken ?? undefined,
      });
    } catch {
      // best-effort — identity was already confirmed at exam start; don't
      // block the student from finishing over an upload hiccup
    } finally {
      setStage("complete");
    }
  }

  if (stage === "closing") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center">
        <p className={cn("text-3xl font-bold tracking-tight", STATUS_COLOR.speaking)}>
          {STATUS_LABEL.speaking}
        </p>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-white">Wrapping up...</h1>
      </div>
    );
  }

  if (stage === "end_photo") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/10">
          <ShieldCheck className="h-7 w-7 text-sky-400" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-white">One last step</h1>
        <p className="mt-2 max-w-sm text-sm text-zinc-400">
          We&apos;re taking a quick photo to confirm your identity for this session — make sure both
          your face and your ID card are visible in the shot.
        </p>
        <div className="mt-6 w-full max-w-xs rounded-[3px] border border-zinc-200 bg-white py-3">
          <FaceWithIdSample />
        </div>
        <div className="mt-3 w-full max-w-xs rounded-[3px] border border-zinc-800 bg-zinc-900 p-4">
          <CameraCapture onCapture={handleEndPhotoCaptured} />
        </div>
        <Button variant="ghost" onClick={() => setStage("complete")} className="mt-4">
          Skip
        </Button>
      </div>
    );
  }

  if (stage === "violation") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
          <ShieldAlert className="h-7 w-7 text-red-400" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-white">Exam ended</h1>
        <p className="mt-2 max-w-sm text-sm text-zinc-400">
          Your exam ended because you left full-screen mode or switched away from this window. This has been
          recorded and your instructor will see it when reviewing your attempt.
        </p>
        <p className="mt-6 text-sm text-zinc-500">You can safely close this tab now.</p>
      </div>
    );
  }

  if (stage === "complete") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-white">Exam complete</h1>
        <p className="mt-2 max-w-sm text-sm text-zinc-400">
          Your responses have been recorded. Your instructor will review your answers and share a link with
          your grade once it&apos;s published.
        </p>
        <p className="mt-6 text-sm text-zinc-500">You can safely close this tab now.</p>
      </div>
    );
  }

  if (stage === "gate") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/10">
          <Maximize className="h-7 w-7 text-sky-400" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-white">Ready to begin</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-400">
          {fullscreenSupported
            ? "This exam runs in full-screen mode. Switching to another tab or window ends your exam immediately. Leaving full-screen (e.g. pressing Escape) will ask you to confirm before ending it — so make sure you're ready before you start."
            : "Your browser doesn't support full-screen mode, so this exam will run in your normal window. Make sure you're somewhere you can focus without interruption before you start."}
        </p>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <Button onClick={enterExam} className="mt-6">
          <Maximize className="h-4 w-4" strokeWidth={2} />
          {fullscreenSupported ? "Enter full-screen & begin" : "Begin exam"}
        </Button>
      </div>
    );
  }

  const orbState: OrbState = loadingQuestion || repeating
    ? repeating
      ? "speaking"
      : "thinking"
    : isSpeaking
      ? "speaking"
      : speech.listening
        ? "listening"
        : "idle";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <div className="flex items-center justify-between px-6 py-4 sm:px-10">
        <span className="text-base font-medium text-zinc-500">Live exam</span>
        {timeRemaining !== null && (
          <span className="font-mono text-base font-medium text-zinc-300">{formatTime(timeRemaining)}</span>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 pb-12 sm:px-8">
        <div className="flex min-h-7 items-center justify-center gap-2">
          {question && !loadingQuestion && (
            <>
              {question.is_graded === false ? (
                <Badge tone="neutral">Warm-up</Badge>
              ) : (
                question.graded_sequence && (
                  <Badge tone="neutral">
                    Question {question.graded_sequence}
                    {maxQuestions ? ` / ${maxQuestions}` : ""}
                  </Badge>
                )
              )}
              {question.is_followup && <Badge tone="neutral">Follow-up</Badge>}
              {question.is_generalization && <Badge tone="neutral">Bigger picture</Badge>}
            </>
          )}
        </div>

        <div className="flex flex-col items-center py-10">
          <p
            className={cn(
              "text-3xl font-bold tracking-tight",
              STATUS_COLOR[loadingQuestion || !question ? "thinking" : orbState]
            )}
          >
            {STATUS_LABEL[loadingQuestion || !question ? "thinking" : orbState]}
          </p>
        </div>

        {question && !loadingQuestion && (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm">
                <button
                  onClick={() => speakText(question.text ?? "")}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20"
                  title="Replay question audio"
                >
                  <Volume2 className="h-4 w-4" strokeWidth={2} />
                </button>
                <p className="text-lg font-medium leading-relaxed text-zinc-100">{question.text}</p>
              </div>

              {question.source_excerpt && (
                <div className="flex items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                      From your own work
                    </p>
                    <div className="mt-1 max-h-40 overflow-y-auto">
                      <SourceExcerpt text={question.source_excerpt} dark highlightTerms={question.highlight_terms} />
                    </div>
                  </div>
                </div>
              )}

              {repeating && (
                <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-3.5 py-2.5 text-base text-sky-300">
                  <RotateCcw className="h-4 w-4 shrink-0" strokeWidth={2} />
                  Repeating the question...
                </div>
              )}

              {activeNudge && !repeating && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3.5 py-2.5 text-base text-amber-300">
                  <Bell className="h-4 w-4 shrink-0" strokeWidth={2} />
                  {activeNudge}
                </div>
              )}

              {speech.supported ? (
                <div className="flex flex-col items-center gap-4 pt-2">
                  {speech.listening && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                      <Mic className="h-4 w-4" strokeWidth={2} />
                      Listening — speak your answer, or say &quot;repeat that&quot; if you need it again
                    </span>
                  )}

                  {error && <p className="text-sm text-red-400">{error}</p>}

                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-sm text-zinc-500">
                      {thinkingSecondsLeft > 0 ? `Thinking time: ${thinkingSecondsLeft}s` : "Speak when you're ready"}
                    </p>
                    <Button
                      onClick={() => submitAnswer(answerRef.current.trim() || NO_ANSWER_MARKER)}
                      disabled={submitting || thinkingSecondsLeft > 0}
                    >
                      {submitting ? "Submitting..." : "I'm done answering"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-base font-medium text-zinc-400">Your answer</label>
                  <Textarea
                    value={answer}
                    onChange={(e) => {
                      handleTranscript(e.target.value);
                      if (e.target.value.trim()) setActiveNudge(null);
                    }}
                    rows={4}
                    placeholder="Type your answer here (voice input isn't supported in this browser)"
                    className="mt-2 border-zinc-800 bg-zinc-900 text-base text-zinc-100 placeholder:text-zinc-600"
                  />

                  {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-zinc-500">
                      {thinkingSecondsLeft > 0 ? `Thinking time: ${thinkingSecondsLeft}s` : "Ready to submit"}
                    </p>
                    <Button
                      onClick={() => submitAnswer(answer.trim())}
                      disabled={submitting || !answer.trim() || thinkingSecondsLeft > 0}
                    >
                      {submitting ? "Submitting..." : "Submit answer"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={showExitConfirm}
        onClose={cancelExitAndResume}
        onConfirm={confirmExitAndEnd}
        title="Exit the exam?"
        description="You've left full-screen mode. Leaving will end your exam now — your answers so far will be submitted as-is and you won't be able to continue. Staying will return you to full-screen and resume where you left off."
        confirmLabel="Yes, end my exam"
        danger
      />
    </div>
  );
}
