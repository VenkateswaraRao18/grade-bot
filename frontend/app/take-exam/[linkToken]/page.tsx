"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock,
  KeyRound,
  ListChecks,
  Mic,
  MessageCircleQuestion,
  ShieldCheck,
  Target,
  XCircle,
} from "lucide-react";
import { apiFetch, apiFetchJson, ApiError } from "@/lib/api";
import { setExamSessionToken } from "@/lib/examSession";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { PageSpinner } from "@/components/ui/Spinner";
import { CameraCapture } from "@/components/exam/CameraCapture";
import { IdCardSample } from "@/components/exam/IdCardSample";
import { cn } from "@/lib/cn";

interface EntryInfo {
  entry_token: string;
  exam_name: string;
  duration_minutes: number;
  difficulty: string;
  thinking_time_seconds: number;
  rubric: string;
}

interface VerifyResult {
  matched: boolean;
  verified_token: string | null;
  extracted_text: string;
  already_completed: boolean;
}

interface StartResult {
  attempt_id: string;
  session_token: string;
}

type Step = "passcode" | "wizard";
type IdFlow = "idle" | "verifying" | "mismatch" | "already_completed";

const WIZARD_STEPS = ["Instructions", "Microphone", "Verify ID", "Ready"] as const;

interface RubricCriterion {
  name: string;
  points: number;
  description: string;
}

// Instructor rubric text is free-form prose with "Name (N pts)" markers.
function parseRubric(rubric: string): RubricCriterion[] | null {
  const markerRe = /([A-Za-z][^.,:()]{1,80}?)\s*\((\d+)\s*pts?\)/g;
  const matches = [...rubric.matchAll(markerRe)];
  if (matches.length === 0) return null;

  return matches.map((m, i) => {
    const name = m[1].trim();
    const points = parseInt(m[2], 10);
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? rubric.length : rubric.length;
    const description = rubric
      .slice(start, end)
      .replace(/^[:,\s]+/, "")
      .replace(/\(\d+\)\s*$/, "")
      .replace(/\s*(Total:|Points sum to)[^.]*\.?\s*$/i, "")
      .trim();
    return { name, points, description };
  });
}

function RubricCriterionRow({ criterion }: { criterion: RubricCriterion }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50">
        <Award className="h-4 w-4 text-sky-600" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">
          {criterion.name}
          <span className="ml-2 text-xs font-bold text-sky-600">{criterion.points} pts</span>
        </p>
        {criterion.description && (
          <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{criterion.description}</p>
        )}
      </div>
    </div>
  );
}

function InstructionPoint({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Clock;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50">
        <Icon className="h-4 w-4 text-sky-600" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{children}</p>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="mx-auto flex w-full max-w-xl items-center px-6 pb-5">
      {WIZARD_STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                i < current
                  ? "bg-emerald-600 text-white"
                  : i === current
                    ? "bg-sky-600 text-white"
                    : "border border-line bg-surface text-ink-soft"
              )}
            >
              {i < current ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
            </div>
            <span className={cn("text-[11px] font-semibold", i === current ? "text-ink" : "text-ink-soft")}>
              {label}
            </span>
          </div>
          {i < WIZARD_STEPS.length - 1 && (
            <div className={cn("mx-2 mb-4 h-0.5 flex-1 rounded-full", i < current ? "bg-emerald-600" : "bg-line")} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function TakeExamPage(props: PageProps<"/take-exam/[linkToken]">) {
  const { linkToken } = use(props.params);
  const router = useRouter();

  const [step, setStep] = useState<Step>("passcode");
  const [passcode, setPasscode] = useState("");
  const [enteringPasscode, setEnteringPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [entryInfo, setEntryInfo] = useState<EntryInfo | null>(null);

  const [wizardStep, setWizardStep] = useState(0);

  const [instructionsAcknowledged, setInstructionsAcknowledged] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [micRequested, setMicRequested] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState("");

  const [idFlow, setIdFlow] = useState<IdFlow>("idle");
  const [idPhotoPreview, setIdPhotoPreview] = useState<string | null>(null);
  const [idCheckError, setIdCheckError] = useState<string | null>(null);
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnterPasscode() {
    setEnteringPasscode(true);
    setPasscodeError(null);
    try {
      const info = await apiFetchJson<EntryInfo>(`/public/exams/${linkToken}/enter`, {
        passcode: passcode.trim(),
      });
      setEntryInfo(info);
      setStep("wizard");
    } catch (err) {
      setPasscodeError(err instanceof ApiError ? err.message : "Could not check that passcode.");
    } finally {
      setEnteringPasscode(false);
    }
  }

  async function requestMic() {
    setMicError(null);
    setMicRequested(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicGranted(true);
    } catch {
      setMicError("Microphone access was denied. You can still type your answers instead.");
    }
  }

  function retakeIdPhoto() {
    setIdFlow("idle");
    setIdPhotoPreview(null);
    setIdCheckError(null);
  }

  async function handleIdPhotoCaptured(file: File) {
    if (!entryInfo) return;
    setIdPhotoPreview(URL.createObjectURL(file));
    setIdCheckError(null);
    setIdFlow("verifying");
    try {
      const formData = new FormData();
      formData.append("candidate_name", candidateName.trim());
      formData.append("file", file);
      const res = await apiFetch<VerifyResult>("/public/verify-id", {
        method: "POST",
        body: formData,
        token: entryInfo.entry_token,
      });
      if (res.matched && res.already_completed) {
        setIdFlow("already_completed");
      } else if (res.matched && res.verified_token) {
        setVerifiedToken(res.verified_token);
        setWizardStep(3);
      } else {
        setIdCheckError(
          "No match found for that ID against this exam's roster. Make sure your instructor has uploaded your " +
            "document, then try a clearer, well-lit photo."
        );
        setIdFlow("mismatch");
      }
    } catch (err) {
      setIdCheckError(err instanceof ApiError ? err.message : "Could not verify that photo. Try again.");
      setIdFlow("mismatch");
    }
  }

  async function handleStart() {
    if (!verifiedToken) return;
    setError(null);
    setStarting(true);
    try {
      const result = await apiFetch<StartResult>("/public/start", { method: "POST", token: verifiedToken });
      setExamSessionToken(result.attempt_id, result.session_token);
      router.push(`/exam/${result.attempt_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the exam.");
      setStarting(false);
    }
  }

  if (step === "passcode") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6">
        <Card className="w-full max-w-sm p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-50">
            <KeyRound className="h-5 w-5 text-sky-600" strokeWidth={1.75} />
          </div>
          <h1 className="mt-3 text-lg font-bold text-ink">Enter your exam passcode</h1>
          <p className="mt-1 text-sm text-ink-soft">Your instructor shared this passcode along with this link.</p>

          <div className="mt-4">
            <Label htmlFor="passcode">Passcode</Label>
            <Input
              id="passcode"
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && passcode.trim()) handleEnterPasscode();
              }}
              placeholder="e.g. 7K4QXD"
              className="font-mono tracking-widest"
            />
            <FieldError>{passcodeError}</FieldError>
          </div>

          <Button
            onClick={handleEnterPasscode}
            disabled={!passcode.trim() || enteringPasscode}
            className="mt-4 w-full"
          >
            {enteringPasscode ? "Checking..." : "Continue"}
          </Button>
        </Card>
      </div>
    );
  }

  if (!entryInfo) return <PageSpinner />;

  const rubricCriteria = parseRubric(entryInfo.rubric);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="border-b border-line bg-surface pt-5">
        <p className="text-center text-xs font-bold uppercase tracking-wide text-ink-soft">{entryInfo.exam_name}</p>
        <Stepper current={wizardStep} />
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-8">
        {/* Step 0: instructions */}
        {wizardStep === 0 && (
          <div className="w-full max-w-2xl">
            <Card className="p-6">
              <h1 className="text-lg font-bold text-ink">Before you begin</h1>
              <p className="mt-1 text-sm text-ink-soft">
                Read through how this exam works and how you&apos;ll be graded.
              </p>

              <div className="mt-2 flex flex-col divide-y divide-zinc-100">
                <InstructionPoint icon={Clock} title={`Up to ${entryInfo.duration_minutes} minutes`}>
                  An AI examiner asks you questions live and may follow up on your answers.
                </InstructionPoint>
                <InstructionPoint icon={ListChecks} title="Warm-up, then your assignment">
                  The first two questions are general context and aren&apos;t graded. After that, every
                  question focuses on your assignment, with follow-ups to clarify your answers.
                </InstructionPoint>
                <InstructionPoint icon={MessageCircleQuestion} title="Answer naturally">
                  Use your own words and explain your reasoning. Don&apos;t know something? Say so honestly —
                  and ask the examiner to repeat a question if you need it.
                </InstructionPoint>
                <InstructionPoint icon={Target} title="What&apos;s assessed">
                  Whether you understand your own work — be ready to explain your methodology, decisions, and
                  results.
                </InstructionPoint>
              </div>

              <div className="mt-2 border-t border-zinc-100 pt-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-ink">How you&apos;ll be graded</h2>
                  {rubricCriteria && (
                    <span className="text-xs font-bold text-ink-soft">
                      Total: {rubricCriteria.reduce((sum, c) => sum + c.points, 0)} pts
                    </span>
                  )}
                </div>
                {rubricCriteria ? (
                  <div className="mt-1 flex flex-col divide-y divide-zinc-100">
                    {rubricCriteria.map((c, i) => (
                      <RubricCriterionRow key={i} criterion={c} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{entryInfo.rubric}</p>
                )}
              </div>

              <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-line bg-canvas p-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={instructionsAcknowledged}
                  onChange={(e) => setInstructionsAcknowledged(e.target.checked)}
                  className="mt-0.5"
                />
                I have read and understood the instructions above.
              </label>

              <Button
                onClick={() => setWizardStep(1)}
                disabled={!instructionsAcknowledged}
                className="mt-4 w-full"
              >
                Continue
              </Button>
            </Card>
          </div>
        )}

        {/* Step 1: microphone */}
        {wizardStep === 1 && (
          <div className="w-full max-w-md">
            <button
              onClick={() => setWizardStep(0)}
              className="mb-4 flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
              Back
            </button>
            <Card className="p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-50">
                <Mic className="h-6 w-6 text-sky-600" strokeWidth={1.75} />
              </div>
              <h1 className="mt-4 text-lg font-bold text-ink">Allow microphone access</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                The AI examiner listens to your spoken answers. You can still type instead if you&apos;d
                rather not use voice.
              </p>

              <div className="mt-5">
                {micGranted ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                    Microphone granted
                  </span>
                ) : (
                  <Button variant="secondary" onClick={requestMic} className="w-full">
                    Allow microphone
                  </Button>
                )}
                {micError && (
                  <p className="mt-2.5 flex items-start gap-1.5 text-left text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    {micError}
                  </p>
                )}
              </div>

              <Button onClick={() => setWizardStep(2)} disabled={!micRequested} className="mt-5 w-full">
                Continue
              </Button>
            </Card>
          </div>
        )}

        {/* Step 2: ID verification — full-page camera capture */}
        {wizardStep === 2 && (
          <div className="w-full max-w-3xl">
            <button
              onClick={() => setWizardStep(1)}
              className="mb-4 flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
              Back
            </button>
            <Card className="p-6 sm:p-8">
              <h1 className="text-lg font-bold text-ink">Confirm it&apos;s you</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                Take a photo of your ID — we&apos;ll match the ID number against the documents your
                instructor uploaded for this exam.
              </p>

              <div className="mt-5 max-w-sm">
                <Label htmlFor="candidate-name">Your full name</Label>
                <Input
                  id="candidate-name"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="As it appears on your ID"
                />
              </div>

              <FieldError>{error}</FieldError>

              {!candidateName.trim() ? (
                <p className="mt-6 text-center text-sm text-ink-soft">
                  Enter your name above to continue to the photo step.
                </p>
              ) : idPhotoPreview ? (
                <div className="mt-6 flex flex-col items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={idPhotoPreview}
                    alt="ID preview"
                    className="max-h-[50vh] w-full rounded-lg border border-line object-contain"
                  />
                  {idFlow === "verifying" && <p className="text-sm text-ink-soft">Checking your photo...</p>}
                  {idFlow === "already_completed" && (
                    <div className="flex flex-col items-center gap-2 rounded-lg bg-success-soft px-4 py-4 text-center">
                      <CheckCircle2 className="h-6 w-6 text-success-ink" strokeWidth={1.75} />
                      <p className="text-sm font-semibold text-success-ink">You&apos;ve already completed this exam</p>
                      <p className="text-xs text-success-ink">
                        Our records show this exam is already finished for you. If that&apos;s wrong, contact your
                        instructor.
                      </p>
                    </div>
                  )}
                  {idFlow === "mismatch" && idCheckError && (
                    <>
                      <p className="flex items-start gap-1.5 text-sm text-red-600">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
                        {idCheckError}
                      </p>
                      <Button variant="secondary" onClick={retakeIdPhoto}>
                        Retake photo
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-6">
                  <div className="mb-4 rounded-lg border border-line bg-canvas py-3">
                    <IdCardSample />
                  </div>
                  <div className="rounded-lg border border-line bg-surface">
                    <CameraCapture size="large" onCapture={handleIdPhotoCaptured} />
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Step 3: ready to start */}
        {wizardStep === 3 && (
          <div className="w-full max-w-md text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <ShieldCheck className="h-6 w-6 text-emerald-700" strokeWidth={1.75} />
            </div>
            <h1 className="mt-4 text-xl font-bold text-ink">You&apos;re verified</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              Once you start, the timer begins immediately and you&apos;ll move into full-screen mode.
            </p>

            <FieldError>{error}</FieldError>

            <Button onClick={handleStart} disabled={starting} className="mt-6 w-full">
              {starting ? "Starting..." : "Start Exam"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
