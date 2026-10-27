"use client";

import { InputHTMLAttributes, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Clock,
  FileText,
  Timer,
  X,
} from "lucide-react";
import { apiFetch, apiFetchJson, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { Exam } from "@/lib/types";
import { UPLOAD_ACCEPT, UPLOAD_HINT } from "@/lib/fileTypes";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldError, Input, Label, Textarea } from "@/components/ui/Input";
import { FileUpload } from "@/components/ui/FileUpload";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/cn";

function NumberedHeader({
  number,
  title,
  description,
  tone,
}: {
  number: number;
  title: string;
  description: string;
  tone: "success" | "accent";
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
          tone === "success" ? "bg-emerald-700" : "bg-accent"
        )}
      >
        {number}
      </span>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        <p className="text-xs text-ink-soft">{description}</p>
      </div>
    </div>
  );
}

function IconInput({ icon: Icon, className, ...props }: { icon: typeof Clock } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" strokeWidth={1.75} />
      <Input className={cn("pl-9", className)} {...props} />
    </div>
  );
}

export default function NewExamPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(20);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [minQuestions, setMinQuestions] = useState(4);
  const [maxQuestions, setMaxQuestions] = useState(8);
  const [adaptive, setAdaptive] = useState(true);
  const [thinkingTime, setThinkingTime] = useState(30);
  const [rubric, setRubric] = useState("");
  const [sampleQuestions, setSampleQuestions] = useState("");
  const [instructorAnswer, setInstructorAnswer] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [extractingAnswer, setExtractingAnswer] = useState(false);
  const [answerExtractError, setAnswerExtractError] = useState<string | null>(null);

  if (!user) return <PageSpinner />;

  async function handleAnswerFileUpload(files: FileList) {
    const file = files[0];
    if (!file) return;
    setExtractingAnswer(true);
    setAnswerExtractError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getToken() ?? undefined;
      const res = await apiFetch<{ text: string }>("/exams/extract-text", {
        method: "POST",
        body: formData,
        token,
      });
      setInstructorAnswer(res.text);
    } catch (err) {
      setAnswerExtractError(err instanceof ApiError ? err.message : "Could not read that file.");
    } finally {
      setExtractingAnswer(false);
    }
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("Give the exam a name.");
      return;
    }
    if (maxQuestions < minQuestions) {
      setError("Max questions must be >= min questions.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      const exam = await apiFetchJson<Exam>(
        "/exams",
        {
          name: name.trim(),
          description: description.trim() || null,
          duration_minutes: duration,
          difficulty,
          min_questions: minQuestions,
          max_questions: maxQuestions,
          adaptive_enabled: adaptive,
          thinking_time_seconds: thinkingTime,
          rubric: rubric.trim() || undefined,
          sample_questions: sampleQuestions.trim() || null,
          instructor_answer: instructorAnswer.trim() || null,
        },
        { token }
      );
      router.push(`/instructor/exams/${exam.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create exam.");
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Exams", href: "/instructor/exams" }, { label: "New exam" }]}
        title="Create a new exam"
        description="Configure your oral exam settings. You'll upload student documents and generate the passcode link from the exam's page after creating it."
        maxWidth="max-w-4xl"
        action={
          <Link href="/instructor/exams">
            <Button variant="secondary">
              <X className="h-4 w-4" strokeWidth={2} />
              Cancel
            </Button>
          </Link>
        }
      />

      <div className="w-full px-6 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex flex-col gap-6">
            <Card className="p-5">
              <NumberedHeader
                number={1}
                title="Basics"
                description="Give your exam a clear name and description."
                tone="success"
              />
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="name">Exam name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Midterm Oral Defense"
                  />
                </div>
                <div>
                  <Label htmlFor="description">What is this exam about? (optional)</Label>
                  <Textarea
                    id="description"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A short description of the assignment or topic being examined — shown to you and used to ground question generation."
                  />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <NumberedHeader
                number={2}
                title="Timing & Difficulty"
                description="Set the duration, difficulty level, and how much time students have to think."
                tone="accent"
              />
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <IconInput
                    icon={Clock}
                    id="duration"
                    type="number"
                    min={1}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="difficulty">Difficulty</Label>
                  <div className="relative">
                    <BarChart3
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
                      strokeWidth={1.75}
                    />
                    <select
                      id="difficulty"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                      className="w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-3.5 text-sm text-ink outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="thinking">Thinking time per question (s)</Label>
                  <IconInput
                    icon={Timer}
                    id="thinking"
                    type="number"
                    min={1}
                    value={thinkingTime}
                    onChange={(e) => setThinkingTime(Number(e.target.value))}
                  />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <NumberedHeader
                number={3}
                title="Questions"
                description="Control the number of questions and enable adaptive follow-ups."
                tone="success"
              />
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="min-q">Min questions</Label>
                  <IconInput
                    icon={FileText}
                    id="min-q"
                    type="number"
                    min={1}
                    value={minQuestions}
                    onChange={(e) => setMinQuestions(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="max-q">Max questions</Label>
                  <IconInput
                    icon={FileText}
                    id="max-q"
                    type="number"
                    min={1}
                    value={maxQuestions}
                    onChange={(e) => setMaxQuestions(Number(e.target.value))}
                  />
                </div>
              </div>
              <label className="mt-4 flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={adaptive}
                  onChange={(e) => setAdaptive(e.target.checked)}
                />
                <span>
                  Adaptive follow-ups (examiner probes deeper based on answers)
                  <span className="block text-xs font-normal text-ink-soft">
                    The AI will ask follow-up questions based on the student&apos;s responses to assess depth of
                    understanding.
                  </span>
                </span>
              </label>
            </Card>

            <Card className="p-5">
              <NumberedHeader
                number={4}
                title="Grading (Optional)"
                description="You can skip this now and fill it in later from the exam's page."
                tone="accent"
              />
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rubric">Grading rubric (a sensible default is used otherwise)</Label>
                  <Textarea
                    id="rubric"
                    rows={3}
                    value={rubric}
                    onChange={(e) => setRubric(e.target.value)}
                    placeholder='e.g. "Clarity and correctness of explanation (30 pts)"'
                  />
                </div>
                <div>
                  <Label htmlFor="sample-questions">Sample questions</Label>
                  <Textarea
                    id="sample-questions"
                    rows={3}
                    value={sampleQuestions}
                    onChange={(e) => setSampleQuestions(e.target.value)}
                    placeholder="A style guide for the examiner — questions you'd ask, to match tone and depth."
                  />
                </div>
              </div>
              <div className="mt-4">
                <Label>Expected answer / grading key</Label>
                <p className="mb-2 text-xs text-ink-soft">
                  Your own expected answer — used as ground truth for scoping questions and grading.
                </p>
                <FileUpload
                  label={instructorAnswer ? "Replace answer sheet" : "Upload answer sheet"}
                  hint={UPLOAD_HINT}
                  accept={UPLOAD_ACCEPT}
                  disabled={extractingAnswer}
                  onFilesSelected={handleAnswerFileUpload}
                />
                {extractingAnswer && <p className="mt-1.5 text-xs text-ink-soft">Reading file...</p>}
                {answerExtractError && <p className="mt-1.5 text-xs text-red-600">{answerExtractError}</p>}
                {instructorAnswer && !extractingAnswer && (
                  <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-line rounded-lg border border-line bg-canvas p-3 text-xs leading-relaxed text-ink">
                    {instructorAnswer}
                  </p>
                )}
              </div>
            </Card>

            <FieldError>{error}</FieldError>

            <div>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Creating..." : "Create exam"}
                {!saving && <ArrowRight className="h-4 w-4" strokeWidth={2} />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
