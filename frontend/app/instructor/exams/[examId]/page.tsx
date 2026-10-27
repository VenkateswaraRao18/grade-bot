"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  Download,
  GraduationCap,
  Hourglass,
  IdCard,
  Info,
  Link2,
  ListChecks,
  Pencil,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import {
  AttemptRow,
  BulkSubmissionResult,
  Exam,
  ExamLink,
  ExamLinkCreate,
  ExamSubmission,
} from "@/lib/types";
import { UPLOAD_ACCEPT, UPLOAD_HINT } from "@/lib/fileTypes";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FileUpload } from "@/components/ui/FileUpload";
import { GradebookMatchUpload } from "@/components/exam/GradebookMatchUpload";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatCard } from "@/components/ui/StatCard";
import { MoreMenu } from "@/components/ui/MoreMenu";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/cn";

function initialsOf(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function attemptDisplayName(a: AttemptRow): string {
  return a.candidate_name || a.account_email || a.student_email;
}

const PAGE_SIZE = 10;

type StatusFilter = "all" | "in_progress" | "awaiting" | "published";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In progress" },
  { key: "awaiting", label: "Awaiting review" },
  { key: "published", label: "Published" },
];

type TabKey = "results" | "documents" | "grading" | "access";

function StatPill({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink">
      <Icon className="h-3.5 w-3.5 text-sky-600" strokeWidth={2} />
      {label}
    </span>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-sky-600" strokeWidth={2} />
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</p>
    </div>
  );
}

interface ReadinessItem {
  key: string;
  label: string;
  description: string;
  ready: boolean;
  notReadyLabel: string;
}

function ReadinessRow({ item }: { item: ReadinessItem }) {
  return (
    <div className="flex items-center gap-3 py-3">
      {item.ready ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={1.75} />
      ) : (
        <Circle className="h-5 w-5 shrink-0 text-ink-soft/40" strokeWidth={1.75} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{item.label}</p>
        <p className="text-xs text-ink-soft">{item.description}</p>
      </div>
      <Badge tone={item.ready ? "success" : "warning"}>{item.ready ? "Ready" : item.notReadyLabel}</Badge>
    </div>
  );
}

const MAPPING_ACCEPT = ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export default function ExamDetailPage(props: PageProps<"/instructor/exams/[examId]">) {
  const { examId } = use(props.params);
  const { user } = useAuth();
  const router = useRouter();

  const [exam, setExam] = useState<Exam | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingRubric, setEditingRubric] = useState(false);
  const [rubricDraft, setRubricDraft] = useState("");
  const [savingRubric, setSavingRubric] = useState(false);
  const [rubricError, setRubricError] = useState<string | null>(null);

  const [editingExam, setEditingExam] = useState(false);
  const [savingExam, setSavingExam] = useState(false);
  const [examError, setExamError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftDuration, setDraftDuration] = useState(20);
  const [draftDifficulty, setDraftDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [draftMinQuestions, setDraftMinQuestions] = useState(4);
  const [draftMaxQuestions, setDraftMaxQuestions] = useState(8);
  const [draftAdaptive, setDraftAdaptive] = useState(true);
  const [draftThinkingTime, setDraftThinkingTime] = useState(30);
  const [draftSampleQuestions, setDraftSampleQuestions] = useState("");
  const [draftInstructorAnswer, setDraftInstructorAnswer] = useState("");
  const [draftAnswerExtracting, setDraftAnswerExtracting] = useState(false);
  const [draftAnswerExtractError, setDraftAnswerExtractError] = useState<string | null>(null);

  const [exportingCsv, setExportingCsv] = useState(false);

  const [examLink, setExamLink] = useState<ExamLink | null>(null);
  const [revealedPasscode, setRevealedPasscode] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));

  const [activeTab, setActiveTab] = useState<TabKey>("results");
  const [documentMode, setDocumentMode] = useState<"gradebook" | "manual">("gradebook");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const [uploadingAnswer, setUploadingAnswer] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);

  const [bulkFiles, setBulkFiles] = useState<FileList | null>(null);
  const [bulkMappingFile, setBulkMappingFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkSubmissionResult | null>(null);

  function load() {
    const token = getToken() ?? undefined;
    return Promise.all([
      apiFetch<Exam>(`/exams/${examId}`, { token }),
      apiFetch<AttemptRow[]>(`/exams/${examId}/attempts`, { token }),
      apiFetch<ExamSubmission[]>(`/exams/${examId}/submissions`, { token }),
    ]).then(([e, a, s]) => {
      setExam(e);
      setAttempts(a);
      setSubmissions(s);
      return { attempts: a, submissions: s };
    });
  }

  function loadLink() {
    const token = getToken() ?? undefined;
    apiFetch<ExamLink>(`/exams/${examId}/link`, { token })
      .then(setExamLink)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setExamLink(null);
      });
  }

  useEffect(() => {
    if (!user) return;
    load()
      .then((loaded) => {
        // A brand-new exam has nothing to show on Results yet — point the
        // instructor at the natural next step (uploading documents)
        // instead of a confusing all-zero results table.
        if (loaded.attempts.length === 0 && loaded.submissions.length === 0) {
          setActiveTab("documents");
        }
      })
      .catch(() => setError("Could not load this exam."))
      .finally(() => setLoading(false));
    loadLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, examId]);

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/exams/${examId}/publish`, { method: "POST", token });
      setConfirmOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish exam.");
    } finally {
      setPublishing(false);
    }
  }

  function startEditRubric() {
    setRubricDraft(exam!.rubric);
    setRubricError(null);
    setEditingRubric(true);
  }

  async function saveRubric() {
    setSavingRubric(true);
    setRubricError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/exams/${examId}/rubric`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubric: rubricDraft }),
        token,
      });
      setEditingRubric(false);
      await load();
    } catch (err) {
      setRubricError(err instanceof ApiError ? err.message : "Could not save rubric.");
    } finally {
      setSavingRubric(false);
    }
  }

  function startEditExam() {
    if (!exam) return;
    setDraftName(exam.name);
    setDraftDescription(exam.description ?? "");
    setDraftDuration(exam.duration_minutes);
    setDraftDifficulty(exam.difficulty);
    setDraftMinQuestions(exam.min_questions);
    setDraftMaxQuestions(exam.max_questions);
    setDraftAdaptive(exam.adaptive_enabled);
    setDraftThinkingTime(exam.thinking_time_seconds);
    setDraftSampleQuestions(exam.sample_questions ?? "");
    setDraftInstructorAnswer(exam.instructor_answer ?? "");
    setDraftAnswerExtractError(null);
    setExamError(null);
    setEditingExam(true);
  }

  async function saveExam() {
    if (draftMaxQuestions < draftMinQuestions) {
      setExamError("Max questions must be >= min questions.");
      return;
    }
    setSavingExam(true);
    setExamError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/exams/${examId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName,
          description: draftDescription || null,
          duration_minutes: draftDuration,
          difficulty: draftDifficulty,
          min_questions: draftMinQuestions,
          max_questions: draftMaxQuestions,
          adaptive_enabled: draftAdaptive,
          thinking_time_seconds: draftThinkingTime,
          sample_questions: draftSampleQuestions || null,
          instructor_answer: draftInstructorAnswer || null,
        }),
        token,
      });
      setEditingExam(false);
      await load();
    } catch (err) {
      setExamError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setSavingExam(false);
    }
  }

  async function handleDeleteExam() {
    setDeleting(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/exams/${examId}`, { method: "DELETE", token });
      router.push("/instructor/exams");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete exam.");
      setDeleteConfirmOpen(false);
      setDeleting(false);
    }
  }

  async function handleGenerateLink() {
    setGeneratingLink(true);
    setLinkError(null);
    try {
      const token = getToken() ?? undefined;
      const result = await apiFetch<ExamLinkCreate>(`/exams/${examId}/link`, { method: "POST", token });
      setExamLink({ exam_id: result.exam_id, link_token: result.link_token });
      setRevealedPasscode(result.passcode);
      setRegenerateConfirmOpen(false);
    } catch (err) {
      setLinkError(err instanceof ApiError ? err.message : "Could not generate link.");
    } finally {
      setGeneratingLink(false);
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500);
    });
  }

  async function handleInstructorAnswerUpload(files: FileList) {
    const file = files[0];
    if (!file) return;
    setUploadingAnswer(true);
    setAnswerError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getToken() ?? undefined;
      const updated = await apiFetch<Exam>(`/exams/${examId}/instructor-answer/upload`, {
        method: "POST",
        body: formData,
        token,
      });
      setExam(updated);
    } catch (err) {
      setAnswerError(err instanceof ApiError ? err.message : "Could not read that file.");
    } finally {
      setUploadingAnswer(false);
    }
  }

  async function handleExportCsv() {
    setExportingCsv(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      const blob = await apiFetchBlob(`/exams/${examId}/grades/export`, { token });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(exam?.name ?? "exam").replace(/\s+/g, "_")}_grades.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not export grades.");
    } finally {
      setExportingCsv(false);
    }
  }

  async function handleDraftAnswerFileUpload(files: FileList) {
    const file = files[0];
    if (!file) return;
    setDraftAnswerExtracting(true);
    setDraftAnswerExtractError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getToken() ?? undefined;
      const res = await apiFetch<{ text: string }>("/exams/extract-text", {
        method: "POST",
        body: formData,
        token,
      });
      setDraftInstructorAnswer(res.text);
    } catch (err) {
      setDraftAnswerExtractError(err instanceof ApiError ? err.message : "Could not read that file.");
    } finally {
      setDraftAnswerExtracting(false);
    }
  }

  async function handleBulkUpload() {
    if (!bulkFiles || bulkFiles.length === 0 || !bulkMappingFile) return;
    setBulkUploading(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const formData = new FormData();
      Array.from(bulkFiles).forEach((f) => formData.append("files", f));
      formData.append("mapping_file", bulkMappingFile);
      const token = getToken() ?? undefined;
      const result = await apiFetch<BulkSubmissionResult>(`/exams/${examId}/bulk-submissions`, {
        method: "POST",
        body: formData,
        token,
      });
      setBulkResult(result);
      setBulkFiles(null);
      setBulkMappingFile(null);
      const token2 = getToken() ?? undefined;
      const updated = await apiFetch<ExamSubmission[]>(`/exams/${examId}/submissions`, { token: token2 });
      setSubmissions(updated);
    } catch (err) {
      setBulkError(err instanceof ApiError ? err.message : "Could not upload documents.");
    } finally {
      setBulkUploading(false);
    }
  }

  if (!user || loading || !exam) return <PageSpinner />;

  const readinessItems: ReadinessItem[] = [
    {
      key: "settings",
      label: "Exam settings",
      description: "Duration, difficulty, and question count",
      ready: true,
      notReadyLabel: "Required",
    },
    {
      key: "documents",
      label: "Student documents",
      description: "Upload student files and the ID mapping sheet",
      ready: submissions.length > 0,
      notReadyLabel: "Required",
    },
    {
      key: "access",
      label: "Student access",
      description: "Generate the passcode link",
      ready: !!examLink,
      notReadyLabel: "Pending",
    },
  ];

  const totalStudents = submissions.length;
  const completedAttempts = attempts.filter((a) => a.status === "completed").length;
  const awaitingReview = attempts.filter((a) => a.status === "completed" && a.grade_status !== "published").length;
  const publishedGrades = attempts.filter((a) => a.grade_status === "published").length;

  const filteredAttempts = attempts
    .filter((a) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        attemptDisplayName(a).toLowerCase().includes(q) ||
        (a.candidate_id_number ?? "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "in_progress" && a.status === "in_progress") ||
        (statusFilter === "awaiting" && a.status === "completed" && a.grade_status !== "published") ||
        (statusFilter === "published" && a.grade_status === "published");
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (!a.ended_at && !b.ended_at) return 0;
      if (!a.ended_at) return -1;
      if (!b.ended_at) return 1;
      return new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime();
    });

  const pageCount = Math.max(1, Math.ceil(filteredAttempts.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedAttempts = filteredAttempts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const TAB_ITEMS: { key: TabKey; label: string }[] = [
    { key: "results", label: "Results" },
    { key: "documents", label: `Documents (${submissions.length})` },
    { key: "grading", label: "Grading" },
    { key: "access", label: "Access" },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Exams", href: "/instructor/exams" }, { label: exam.name }]}
        title={exam.name}
        maxWidth="max-w-6xl"
        description={
          <span className="flex items-center gap-2">
            <Badge tone={exam.status === "published" ? "success" : "neutral"}>{exam.status}</Badge>
            <span className="font-[family-name:var(--font-mono)] text-xs text-ink-soft">
              Created {new Date(exam.created_at).toLocaleDateString()} · Updated{" "}
              {new Date(exam.updated_at).toLocaleDateString()}
            </span>
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            {exam.status === "draft" && (
              <Button onClick={() => setConfirmOpen(true)} disabled={publishing}>
                <Rocket className="h-4 w-4" strokeWidth={2} />
                Publish exam
              </Button>
            )}
            {attempts.length > 0 ? (
              // Once students have attempted it, the instructor's focus is
              // reviewing results, not administering the exam — Edit/Delete
              // step back into an overflow menu instead of full buttons.
              <MoreMenu
                items={[
                  { label: "Edit", icon: Pencil, onClick: startEditExam },
                  { label: "Delete exam", icon: Trash2, onClick: () => setDeleteConfirmOpen(true), danger: true },
                ]}
              />
            ) : (
              <>
                {!editingExam && (
                  <Button variant="secondary" onClick={startEditExam}>
                    Edit
                  </Button>
                )}
                <Button variant="danger" onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                  Delete
                </Button>
              </>
            )}
          </div>
        }
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handlePublish}
        busy={publishing}
        title="Publish this exam?"
        description="Once published, the student link (if generated) becomes usable. Question generation stays server-side, so nothing is exposed ahead of time — only that the exam exists."
        confirmLabel="Publish exam"
      />

      <ConfirmDialog
        open={regenerateConfirmOpen}
        onClose={() => setRegenerateConfirmOpen(false)}
        onConfirm={handleGenerateLink}
        busy={generatingLink}
        danger
        title="Regenerate the student link?"
        description="The current link and passcode stop working immediately. Any student who hasn't started yet will need the new ones — anyone already mid-exam is unaffected."
        confirmLabel={generatingLink ? "Regenerating..." : "Regenerate"}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteExam}
        busy={deleting}
        danger
        title="Delete this exam?"
        description={
          attempts.length > 0
            ? `This exam has ${attempts.length} attempt${attempts.length === 1 ? "" : "s"} — deleting it permanently removes all of their transcripts, grades, and feedback too, along with every uploaded document. This can't be undone.`
            : "This exam has no attempts yet. This can't be undone."
        }
        confirmLabel={deleting ? "Deleting..." : "Delete exam"}
      />

      <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-8">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {editingExam ? (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
            {attempts.length > 0 && (
              <p className="text-xs text-warn">
                This exam already has {attempts.length} attempt{attempts.length === 1 ? "" : "s"} — changes here
                only affect new attempts going forward.
              </p>
            )}

            <Card className="p-5">
              <SectionHeader icon={Info} label="Basics" />
              <div className="mt-3 flex flex-col gap-4">
                <div>
                  <Label htmlFor="edit-name">Exam name</Label>
                  <Input id="edit-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="edit-description">What is this exam about?</Label>
                  <Textarea
                    id="edit-description"
                    rows={2}
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                  />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader icon={Clock} label="Timing & difficulty" />
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-duration">Duration (minutes)</Label>
                  <Input
                    id="edit-duration"
                    type="number"
                    min={1}
                    value={draftDuration}
                    onChange={(e) => setDraftDuration(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-difficulty">Difficulty</Label>
                  <select
                    id="edit-difficulty"
                    value={draftDifficulty}
                    onChange={(e) => setDraftDifficulty(e.target.value as typeof draftDifficulty)}
                    className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="edit-thinking">Thinking time per question (s)</Label>
                  <Input
                    id="edit-thinking"
                    type="number"
                    min={1}
                    value={draftThinkingTime}
                    onChange={(e) => setDraftThinkingTime(Number(e.target.value))}
                  />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader icon={ListChecks} label="Questions" />
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-min-q">Min questions</Label>
                  <Input
                    id="edit-min-q"
                    type="number"
                    min={1}
                    value={draftMinQuestions}
                    onChange={(e) => setDraftMinQuestions(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-max-q">Max questions</Label>
                  <Input
                    id="edit-max-q"
                    type="number"
                    min={1}
                    value={draftMaxQuestions}
                    onChange={(e) => setDraftMaxQuestions(Number(e.target.value))}
                  />
                </div>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={draftAdaptive}
                  onChange={(e) => setDraftAdaptive(e.target.checked)}
                />
                Adaptive follow-ups (examiner probes deeper based on answers)
              </label>
            </Card>

            <Card className="p-5">
              <SectionHeader icon={Award} label="Grading (optional)" />
              <div className="mt-3 flex flex-col gap-4">
                <div>
                  <Label htmlFor="edit-sample-questions">Sample questions</Label>
                  <Textarea
                    id="edit-sample-questions"
                    rows={3}
                    value={draftSampleQuestions}
                    onChange={(e) => setDraftSampleQuestions(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Expected answer / grading key</Label>
                  <p className="mb-2 text-xs text-ink-soft">
                    Your own expected answer — used as ground truth for scoping questions and grading.
                  </p>
                  <FileUpload
                    label={draftInstructorAnswer ? "Replace answer sheet" : "Upload answer sheet"}
                    hint={UPLOAD_HINT}
                    accept={UPLOAD_ACCEPT}
                    disabled={draftAnswerExtracting}
                    onFilesSelected={handleDraftAnswerFileUpload}
                  />
                  {draftAnswerExtracting && <p className="mt-1.5 text-xs text-ink-soft">Reading file...</p>}
                  {draftAnswerExtractError && (
                    <p className="mt-1.5 text-xs text-red-600">{draftAnswerExtractError}</p>
                  )}
                  {draftInstructorAnswer && !draftAnswerExtracting && (
                    <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-line rounded-lg border border-line bg-canvas p-3 text-xs leading-relaxed text-ink">
                      {draftInstructorAnswer}
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {examError && <p className="text-sm text-red-600">{examError}</p>}

            <div className="flex gap-2">
              <Button onClick={saveExam} disabled={savingExam}>
                {savingExam ? "Saving..." : "Save changes"}
              </Button>
              <Button variant="ghost" onClick={() => setEditingExam(false)} disabled={savingExam}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <StatPill icon={Clock} label={`${exam.duration_minutes} min`} />
              <StatPill icon={BarChart3} label={exam.difficulty[0].toUpperCase() + exam.difficulty.slice(1)} />
              <StatPill icon={ListChecks} label={`${exam.min_questions}–${exam.max_questions} questions`} />
              {exam.adaptive_enabled && <StatPill icon={Sparkles} label="Adaptive" />}
            </div>

            {exam.description && (
              <Card className="mb-6 p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">About this exam</p>
                <p className="mt-2 text-sm leading-relaxed text-ink">{exam.description}</p>
              </Card>
            )}

            <Tabs items={TAB_ITEMS} active={activeTab} onChange={(k) => setActiveTab(k as TabKey)} className="mb-6" />

            {activeTab === "results" && (
              <>
                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <StatCard icon={Users} label="Total students" value={totalStudents} tone="ink" />
                  <StatCard icon={GraduationCap} label="Completed" value={completedAttempts} tone="accent" />
                  <StatCard icon={Hourglass} label="Awaiting review" value={awaitingReview} tone="accent" />
                  <StatCard icon={Sparkles} label="Published" value={publishedGrades} tone="success" />
                </div>

                <Card className="overflow-hidden">
                  <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative w-full sm:max-w-xs">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
                        strokeWidth={1.75}
                      />
                      <Input
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(1);
                        }}
                        placeholder="Search by name or student ID"
                        className="pl-9"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {STATUS_FILTERS.map((f) => (
                          <button
                            key={f.key}
                            onClick={() => {
                              setStatusFilter(f.key);
                              setPage(1);
                            }}
                            className={cn(
                              "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                              statusFilter === f.key
                                ? "bg-ink text-white"
                                : "bg-canvas text-ink-soft hover:text-ink"
                            )}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={exportingCsv}>
                        <Download className="h-3.5 w-3.5" strokeWidth={2} />
                        {exportingCsv ? "Exporting..." : "Export CSV"}
                      </Button>
                    </div>
                  </div>

                  {filteredAttempts.length === 0 ? (
                    <div className="p-2">
                      <EmptyState
                        icon={Users}
                        title={attempts.length === 0 ? "No attempts yet" : "No matching students"}
                        description={
                          attempts.length === 0
                            ? "Nothing to review until a student takes this exam."
                            : "Try a different search or status filter."
                        }
                      />
                    </div>
                  ) : (
                    <>
                      {/* Mobile: stacked cards — a wide table needs horizontal scroll
                          with no visual hint that there's more off-screen, which reads
                          as "that's all the data" rather than "swipe for more". */}
                      <div className="flex flex-col divide-y divide-line sm:hidden">
                        {pagedAttempts.map((a) => {
                          const name = attemptDisplayName(a);
                          const score = a.instructor_score ?? a.ai_score;
                          const shareUrl = a.share_token ? `${origin}/results/${a.share_token}` : null;
                          return (
                            <button
                              key={a.attempt_id}
                              onClick={() => router.push(`/instructor/attempts/${a.attempt_id}/grade`)}
                              className="flex items-start gap-3 px-4 py-3.5 text-left transition-colors active:bg-canvas"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700">
                                {initialsOf(name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate font-medium text-ink">{name}</span>
                                  {score != null ? (
                                    <span className="shrink-0 font-[family-name:var(--font-mono)] text-sm font-semibold text-ink">
                                      {score}
                                      <span className="text-xs font-medium text-ink-soft"> / {a.ai_max_score ?? 100}</span>
                                    </span>
                                  ) : (
                                    <span className="shrink-0 text-xs text-ink-soft">—</span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-xs text-ink-soft">
                                  {a.candidate_id_number && <IdCard className="h-3 w-3 shrink-0" strokeWidth={1.75} />}
                                  {a.candidate_id_number ?? "—"}
                                  <span className="text-ink-soft/50">·</span>
                                  {a.ended_at ? new Date(a.ended_at).toLocaleDateString() : "—"}
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {a.status === "in_progress" && <Badge tone="accent">In progress</Badge>}
                                  {a.ended_reason === "integrity_violation" && (
                                    <Badge tone="warning">Left early</Badge>
                                  )}
                                  {a.ended_reason === "missing_submission" && (
                                    <Badge tone="warning">Missing document</Badge>
                                  )}
                                  {a.status === "completed" && (
                                    <Badge tone={a.grade_status === "published" ? "success" : "neutral"}>
                                      {a.grade_status ? a.grade_status.replace("_", " ") : "Not graded"}
                                    </Badge>
                                  )}
                                  {shareUrl && (
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(shareUrl, `row:${a.attempt_id}`);
                                      }}
                                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600"
                                    >
                                      {copiedField === `row:${a.attempt_id}` ? (
                                        <>
                                          <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                                          Copied
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="h-3 w-3" strokeWidth={2} />
                                          Copy link
                                        </>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-soft" strokeWidth={2} />
                            </button>
                          );
                        })}
                      </div>

                      {/* Desktop/tablet: full table */}
                      <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full min-w-[720px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-ink-soft">
                            <th className="px-4 py-3 font-bold">Student</th>
                            <th className="px-4 py-3 font-bold">Student ID</th>
                            <th className="px-4 py-3 font-bold">Completed</th>
                            <th className="px-4 py-3 text-right font-bold">Score</th>
                            <th className="px-4 py-3 font-bold">Status</th>
                            <th className="px-4 py-3 font-bold">Results link</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {pagedAttempts.map((a) => {
                            const name = attemptDisplayName(a);
                            const score = a.instructor_score ?? a.ai_score;
                            const shareUrl = a.share_token ? `${origin}/results/${a.share_token}` : null;
                            return (
                              <tr
                                key={a.attempt_id}
                                onClick={() => router.push(`/instructor/attempts/${a.attempt_id}/grade`)}
                                className="cursor-pointer transition-colors hover:bg-canvas"
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700">
                                      {initialsOf(name)}
                                    </div>
                                    <span className="truncate font-medium text-ink">{name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-xs text-ink-soft">
                                    {a.candidate_id_number && (
                                      <IdCard className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                                    )}
                                    {a.candidate_id_number ?? "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-ink-soft">
                                  {a.ended_at ? new Date(a.ended_at).toLocaleDateString() : "—"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {score != null ? (
                                    <span className="font-[family-name:var(--font-mono)] font-semibold text-ink">
                                      {score}
                                      <span className="text-xs font-medium text-ink-soft"> / {a.ai_max_score ?? 100}</span>
                                    </span>
                                  ) : (
                                    <span className="text-xs text-ink-soft">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {a.status === "in_progress" && <Badge tone="accent">In progress</Badge>}
                                    {a.ended_reason === "integrity_violation" && (
                                      <Badge tone="warning">Left early</Badge>
                                    )}
                                    {a.ended_reason === "missing_submission" && (
                                      <Badge tone="warning">Missing document</Badge>
                                    )}
                                    {a.status === "completed" && (
                                      <Badge tone={a.grade_status === "published" ? "success" : "neutral"}>
                                        {a.grade_status ? a.grade_status.replace("_", " ") : "Not graded"}
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                  {shareUrl ? (
                                    <button
                                      onClick={() => copyToClipboard(shareUrl, `row:${a.attempt_id}`)}
                                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700"
                                    >
                                      {copiedField === `row:${a.attempt_id}` ? (
                                        <>
                                          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                                          Copied
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                                          Copy link
                                        </>
                                      )}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-ink-soft/60">Not published</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <ChevronRight className="h-4 w-4 text-ink-soft" strokeWidth={2} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                    </>
                  )}

                  {filteredAttempts.length > 0 && pageCount > 1 && (
                    <div className="flex items-center justify-between border-t border-line px-4 py-3">
                      <p className="text-xs text-ink-soft">
                        Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                        {Math.min(currentPage * PAGE_SIZE, filteredAttempts.length)} of {filteredAttempts.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-xs text-ink-soft">
                          Page {currentPage} of {pageCount}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                          disabled={currentPage === pageCount}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </>
            )}

            {activeTab === "documents" && (
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                    Student documents &middot; {submissions.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDocumentMode("gradebook")}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                        documentMode === "gradebook" ? "bg-ink text-white" : "bg-canvas text-ink-soft hover:text-ink"
                      )}
                    >
                      Match from gradebook CSV
                    </button>
                    <button
                      onClick={() => setDocumentMode("manual")}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                        documentMode === "manual" ? "bg-ink text-white" : "bg-canvas text-ink-soft hover:text-ink"
                      )}
                    >
                      Upload mapping sheet
                    </button>
                  </div>
                </div>

                {documentMode === "gradebook" ? (
                  <>
                    <p className="mt-1 text-xs text-ink-soft">
                      Upload the files Canvas gave you from &quot;Download Submissions&quot; as-is, plus a Canvas
                      Gradebook CSV export for this course — matching is automatic by Canvas&apos;s internal
                      student ID, no manual mapping sheet needed.
                    </p>
                    <div className="mt-3">
                      <GradebookMatchUpload
                        examId={examId}
                        onUploaded={() => {
                          const token = getToken() ?? undefined;
                          apiFetch<ExamSubmission[]>(`/exams/${examId}/submissions`, { token }).then(setSubmissions);
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-ink-soft">
                      Bulk-upload every student&apos;s document for this exam, tagged to their ID number via a
                      mapping sheet (columns: <span className="font-[family-name:var(--font-mono)]">student_id_number</span>,{" "}
                      <span className="font-[family-name:var(--font-mono)]">filename</span>) — this is how the exam
                      matches a student&apos;s photographed ID to their own work.
                    </p>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <FileUpload
                          label="Student files"
                          hint={UPLOAD_HINT}
                          accept={UPLOAD_ACCEPT}
                          multiple
                          onFilesSelected={setBulkFiles}
                        />
                        {bulkFiles && bulkFiles.length > 0 && (
                          <p className="mt-1.5 text-xs font-medium text-ink">
                            {bulkFiles.length} file{bulkFiles.length === 1 ? "" : "s"} selected
                          </p>
                        )}
                      </div>
                      <div>
                        <FileUpload
                          label="Mapping sheet"
                          hint=".csv or .xlsx"
                          accept={MAPPING_ACCEPT}
                          onFilesSelected={(files) => setBulkMappingFile(files[0] ?? null)}
                        />
                        {bulkMappingFile && (
                          <p className="mt-1.5 truncate text-xs font-medium text-ink">{bulkMappingFile.name}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={handleBulkUpload}
                      disabled={!bulkFiles?.length || !bulkMappingFile || bulkUploading}
                    >
                      {bulkUploading
                        ? "Uploading..."
                        : `Upload ${bulkFiles?.length ?? 0} document${bulkFiles?.length === 1 ? "" : "s"}`}
                    </Button>
                    {bulkError && <p className="mt-2 whitespace-pre-wrap text-xs text-red-600">{bulkError}</p>}
                    {bulkResult && (
                      <p className="mt-2 text-xs text-emerald-700">
                        {bulkResult.created} added, {bulkResult.updated} updated
                        {bulkResult.failed_indexing.length > 0 &&
                          `, ${bulkResult.failed_indexing.length} failed to index`}
                        .
                      </p>
                    )}
                  </>
                )}

                {submissions.length > 0 && (
                  <div className="mt-4 flex max-h-96 flex-col gap-1.5 divide-y divide-line overflow-y-auto border-t border-line pt-1">
                    {submissions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                        <span className="shrink-0 font-[family-name:var(--font-mono)] text-xs text-ink">
                          {s.student_id_number ?? s.student_email}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-right text-xs text-ink-soft">
                          {s.original_filename}
                        </span>
                        {s.indexed ? <Badge tone="success">Indexed</Badge> : <Badge tone="warning">Pending</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {activeTab === "grading" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {exam.sample_questions && (
                  <Card className="p-5 lg:col-span-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Sample questions</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
                      {exam.sample_questions}
                    </p>
                  </Card>
                )}

                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Grading rubric</p>
                    {!editingRubric && (
                      <button
                        onClick={startEditRubric}
                        className="text-xs font-bold text-sky-600 hover:text-sky-700"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {editingRubric ? (
                    <>
                      <Textarea
                        rows={4}
                        value={rubricDraft}
                        onChange={(e) => setRubricDraft(e.target.value)}
                        className="mt-2"
                      />
                      <p className="mt-1.5 text-xs text-ink-soft">
                        Give each criterion a point value in parentheses, e.g. &quot;Conceptual understanding (35
                        pts)&quot;, summing to 100.
                      </p>
                      {rubricError && <p className="mt-1.5 text-xs text-red-600">{rubricError}</p>}
                      <div className="mt-2.5 flex gap-2">
                        <Button size="sm" onClick={saveRubric} disabled={savingRubric}>
                          {savingRubric ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingRubric(false)}
                          disabled={savingRubric}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm leading-relaxed text-ink">{exam.rubric}</p>
                  )}
                </Card>

                <Card className="p-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                    Expected answer / grading key
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    The text is extracted and used as ground truth for grading and scoping questions. You can
                    also edit it directly via Edit.
                  </p>
                  <div className="mt-3">
                    <FileUpload
                      label={exam.instructor_answer ? "Replace answer sheet" : "Upload answer sheet"}
                      hint={UPLOAD_HINT}
                      accept={UPLOAD_ACCEPT}
                      disabled={uploadingAnswer}
                      onFilesSelected={handleInstructorAnswerUpload}
                    />
                  </div>
                  {exam.instructor_answer && (
                    <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-ink">
                      {exam.instructor_answer}
                    </p>
                  )}
                  {answerError && <p className="mt-2 text-xs text-red-600">{answerError}</p>}
                </Card>
              </div>
            )}

            {activeTab === "access" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="p-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Exam readiness</p>
                  <p className="mt-1 text-xs text-ink-soft">Track what&apos;s ready before sharing this assessment.</p>
                  <div className="mt-1 flex flex-col divide-y divide-line">
                    {readinessItems.map((item) => (
                      <ReadinessRow key={item.key} item={item} />
                    ))}
                  </div>
                </Card>

                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Student access</p>
                    <Link2 className="h-3.5 w-3.5 text-ink-soft" strokeWidth={2} />
                  </div>

                  {!examLink ? (
                    <>
                      <p className="mt-2 text-sm text-ink-soft">
                        No student accounts needed — generate a secure link and one-time passcode to distribute
                        through your LMS.
                      </p>
                      <Button size="sm" className="mt-3" onClick={handleGenerateLink} disabled={generatingLink}>
                        {generatingLink ? "Generating..." : "Generate student link"}
                      </Button>
                    </>
                  ) : (
                    <div className="mt-2.5 flex flex-col gap-3">
                      <div>
                        <Label>Link</Label>
                        <div className="flex gap-1.5">
                          <Input
                            readOnly
                            value={`${origin}/take-exam/${examLink.link_token}`}
                            className="text-xs"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => copyToClipboard(`${origin}/take-exam/${examLink.link_token}`, "link")}
                          >
                            {copiedField === "link" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2} />
                            ) : (
                              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                            )}
                          </Button>
                        </div>
                      </div>

                      {revealedPasscode ? (
                        <div>
                          <Label>Passcode (shown once — copy it now)</Label>
                          <div className="flex gap-1.5">
                            <Input
                              readOnly
                              value={revealedPasscode}
                              className="font-[family-name:var(--font-mono)] text-sm font-bold tracking-wider text-sky-700"
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => copyToClipboard(revealedPasscode, "passcode")}
                            >
                              {copiedField === "passcode" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2} />
                              ) : (
                                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-ink-soft">
                          The passcode was only shown when this link was last generated — regenerate to see a new
                          one if you&apos;ve lost it.
                        </p>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRegenerateConfirmOpen(true)}
                        disabled={generatingLink}
                      >
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                        Regenerate
                      </Button>
                    </div>
                  )}
                  {linkError && <p className="mt-2 text-xs text-red-600">{linkError}</p>}
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
