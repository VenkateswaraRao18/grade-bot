"use client";

import { use, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Copy, History, Hourglass, RefreshCw, Rocket, Sparkles } from "lucide-react";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { SourceExcerpt } from "@/components/exam/SourceExcerpt";
import { AttemptContext, AuditLogEntry, GradeReview, GradingDetail } from "@/lib/types";

// Grading now runs automatically in the background the instant an attempt
// completes (see backend/app/services/auto_grading.py) — typically done
// within ~10-20s. Rather than greeting the instructor with a manual
// "Run AI grading" button (which reads as "you need to do this"), this page
// polls silently for that window and only reveals the manual fallback if
// auto-grading genuinely hasn't produced a grade by MAX_GRADING_POLLS * 3s.
const MAX_GRADING_POLLS = 15;

const CRITERION_COLORS = [
  { text: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200", dot: "bg-sky-600" },
  { text: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", dot: "bg-violet-600" },
  { text: "text-accent", bg: "bg-accent-soft", border: "border-accent/30", dot: "bg-accent" },
  { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-600" },
];

function criterionColor(name: string | null, details: GradingDetail[]) {
  const idx = details.findIndex((d) => d.criterion === name);
  return CRITERION_COLORS[idx >= 0 ? idx % CRITERION_COLORS.length : 0];
}

function ScoreInput({
  value,
  max,
  onChange,
}: {
  value: string;
  max: number;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-14 rounded-lg border border-line bg-surface px-1.5 py-1.5 text-center text-sm text-ink outline-none transition-shadow focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

export default function GradeReviewPage(props: PageProps<"/instructor/attempts/[attemptId]/grade">) {
  const { attemptId } = use(props.params);
  const { user } = useAuth();

  const [context, setContext] = useState<AttemptContext | null>(null);
  const [review, setReview] = useState<GradeReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [notGradedYet, setNotGradedYet] = useState(false);
  const [grading, setGrading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [instructorScore, setInstructorScore] = useState("");
  const [criterionScores, setCriterionScores] = useState<Record<string, string>>({});
  const [instructorFeedback, setInstructorFeedback] = useState("");
  const [reason, setReason] = useState("");

  const [pollCount, setPollCount] = useState(0);

  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [endPhotoUrl, setEndPhotoUrl] = useState<string | null>(null);
  const [resultsLink, setResultsLink] = useState<string | null>(null);
  const [resultsLinkCopied, setResultsLinkCopied] = useState(false);

  function loadResultsLink(gradeId: string) {
    const token = getToken() ?? undefined;
    apiFetch<{ token: string }>(`/grades/${gradeId}/share-link`, { token })
      .then((r) => setResultsLink(`${window.location.origin}/results/${r.token}`))
      .catch(() => setResultsLink(null));
  }

  function copyResultsLink() {
    if (!resultsLink) return;
    navigator.clipboard.writeText(resultsLink).then(() => {
      setResultsLinkCopied(true);
      setTimeout(() => setResultsLinkCopied(false), 1500);
    });
  }

  async function loadEndPhoto() {
    try {
      const token = getToken() ?? undefined;
      const blob = await apiFetchBlob(`/attempts/${attemptId}/end-photo`, { token });
      setEndPhotoUrl(URL.createObjectURL(blob));
    } catch {
      // best-effort — the button just stays visible to retry
    }
  }

  function load() {
    const token = getToken() ?? undefined;
    return apiFetch<GradeReview>(`/attempts/${attemptId}/grade`, { token }).then((r) => {
      setReview(r);
      setInstructorScore(r.grade.instructor_score?.toString() ?? r.grade.ai_score?.toString() ?? "");
      setCriterionScores(Object.fromEntries(r.grade.details.map((d) => [d.criterion, d.score.toString()])));
      setInstructorFeedback(r.grade.instructor_feedback ?? "");
      if (r.grade.status === "published") {
        loadResultsLink(r.grade.id);
      } else {
        setResultsLink(null);
      }
      const t = getToken() ?? undefined;
      apiFetch<AuditLogEntry[]>(`/grades/${r.grade.id}/audit-log`, { token: t })
        .then(setAuditLog)
        .catch(() => setAuditLog([]));
    });
  }

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    apiFetch<AttemptContext>(`/attempts/${attemptId}/context`, { token })
      .then(setContext)
      .catch(() => {});
    load()
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotGradedYet(true);
        else setError("Could not load this attempt.");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, attemptId]);

  // Silent polling while background auto-grading is still expected to be
  // running — only for a genuinely completed attempt with something to
  // grade (not still in progress, not a flagged no-content attempt like a
  // missing submission, where there will never be a grade to find).
  useEffect(() => {
    if (!notGradedYet || loading) return;
    if (!context || context.status !== "completed" || context.ended_reason) return;
    if (pollCount >= MAX_GRADING_POLLS) return;

    const timer = setTimeout(() => {
      load()
        .then(() => setNotGradedYet(false))
        .catch(() => setPollCount((c) => c + 1));
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notGradedYet, loading, context, pollCount]);

  async function runGrading() {
    setGrading(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/attempts/${attemptId}/grade`, { method: "POST", token });
      setNotGradedYet(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Grading failed.");
    } finally {
      setGrading(false);
    }
  }

  async function saveOverride() {
    if (!review || !reason.trim()) {
      setError("Give a reason for this override before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/grades/${review.grade.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructor_score: instructorScore ? Number(instructorScore) : null,
          criterion_scores: Object.fromEntries(
            Object.entries(criterionScores).map(([k, v]) => [k, Number(v)])
          ),
          instructor_feedback: instructorFeedback.trim() || null,
          reason: reason.trim(),
        }),
        token,
      });
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save override.");
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    if (!review) return;
    setTransitioning(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/grades/${review.grade.id}/finalize`, { method: "POST", token });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not finalize.");
    } finally {
      setTransitioning(false);
    }
  }

  async function publish() {
    if (!review) return;
    setTransitioning(true);
    setError(null);
    try {
      const token = getToken() ?? undefined;
      await apiFetch(`/grades/${review.grade.id}/publish`, { method: "POST", token });
      setPublishConfirmOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish.");
    } finally {
      setTransitioning(false);
    }
  }

  if (!user || loading) return <PageSpinner />;

  const isOverridden = review?.grade.instructor_score != null;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Overview", href: "/instructor" },
          ...(context ? [{ label: context.exam_name }] : []),
          { label: "Grade review" },
        ]}
        title={context?.student_email ?? "Grade review"}
        maxWidth="max-w-6xl"
      />

      <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-8">
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {notGradedYet && context?.status !== "completed" && (
        <div className="mb-6">
          <EmptyState
            icon={Clock}
            title="Exam still in progress"
            description="This student hasn't finished their attempt yet — grading starts automatically the moment they do."
          />
        </div>
      )}

      {notGradedYet && context?.status === "completed" && context.ended_reason && (
        <div className="mb-6">
          <EmptyState
            icon={AlertTriangle}
            title="Nothing to grade"
            description={
              context.ended_reason === "missing_submission"
                ? "This attempt ended with no gradeable questions — the student's submission wasn't found on file. Upload their document, then have them retake the exam."
                : "This attempt ended early with no gradeable questions recorded."
            }
          />
        </div>
      )}

      {notGradedYet && context?.status === "completed" && !context.ended_reason && (
        <div className="mb-6">
          {pollCount < MAX_GRADING_POLLS ? (
            <EmptyState
              icon={Hourglass}
              title="Grading in progress"
              description="This happens automatically as soon as an exam finishes — no action needed, this usually takes under 20 seconds."
            />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="Automatic grading hasn't finished"
              description="This is taking longer than expected. You can retry it manually below."
              action={
                <Button onClick={runGrading} disabled={grading}>
                  {grading ? "Grading (this calls the LLM, ~10-20s)..." : "Retry AI grading"}
                </Button>
              }
            />
          )}
        </div>
      )}

      {review && (
        <>
          <div className="mb-6 flex items-center gap-2">
            <Badge tone={review.grade.status === "published" ? "success" : "neutral"}>
              {review.grade.status.replace("_", " ")}
            </Badge>
            {review.grade.confidence != null && (
              <span className="text-xs text-ink-soft">AI confidence: {Math.round(review.grade.confidence * 100)}%</span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* main column */}
            <div className="flex flex-col gap-6 lg:col-span-2">
              <Card
                className={
                  isOverridden ? "border-2 border-emerald-200 p-5" : "border-2 border-accent/30 p-5"
                }
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                      What the student will see
                    </p>
                    <Badge tone={isOverridden ? "success" : "accent"}>
                      {isOverridden ? "Instructor-confirmed" : "AI-suggested"}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={runGrading} disabled={grading}>
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                    Re-run AI
                  </Button>
                </div>

                <div className="mt-2 flex items-end gap-3">
                  <p className="font-[family-name:var(--font-mono)] text-4xl font-semibold text-ink">
                    {review.grade.instructor_score ?? review.grade.ai_score ?? "—"}
                    <span className="text-lg font-medium text-ink-soft"> / {review.grade.ai_max_score ?? 100}</span>
                  </p>
                  {review.grade.instructor_score != null &&
                    review.grade.ai_score != null &&
                    review.grade.instructor_score !== review.grade.ai_score && (
                      <p className="pb-1.5 text-xs font-medium text-ink-soft">
                        AI originally scored this {review.grade.ai_score} / {review.grade.ai_max_score ?? 100}
                      </p>
                    )}
                </div>

                {review.grade.strengths && (
                  <div className="mt-5 border-t border-line pt-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">AI: Strengths</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink">{review.grade.strengths}</p>
                  </div>
                )}
                {review.grade.weaknesses && (
                  <div className="mt-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">AI: Weaknesses</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink">{review.grade.weaknesses}</p>
                  </div>
                )}
                {review.grade.instructor_feedback && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Instructor&apos;s note</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-emerald-900">{review.grade.instructor_feedback}</p>
                  </div>
                )}

                <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft/80">
                  One scoring chain, no separate AI judgment calls: each question in the transcript is scored 0-10,
                  each rubric criterion is the average of the questions tagged to it (scaled to its points), and the
                  AI&apos;s overall score is the sum of those criteria. Every number traces back to the transcript.
                </p>
              </Card>

              <Card className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Transcript</p>
                <div className="mt-3 flex flex-col gap-4">
                  {review.transcript.map((t) => (
                    <div key={t.sequence} className="border-b border-line pb-4 last:border-0 last:pb-0">
                      <p className="text-sm font-bold text-ink">
                        Q{t.sequence}
                        {!t.is_graded && (
                          <span className="ml-2 text-xs font-normal text-ink-soft">(warm-up — not graded)</span>
                        )}
                        {t.is_followup && <span className="ml-2 text-xs font-normal text-ink-soft">(follow-up)</span>}
                        {t.is_generalization && (
                          <span className="ml-2 text-xs font-normal text-sky-600">(generalization)</span>
                        )}
                        : {t.question}
                      </p>
                      <p className="mt-1.5 text-sm text-ink-soft">A: {t.answer ?? "(no answer recorded)"}</p>
                      {t.source_excerpt && (
                        <details className="mt-1.5 text-xs text-ink-soft">
                          <summary className="cursor-pointer font-medium text-ink-soft hover:text-ink">
                            Source excerpt this question was grounded in
                          </summary>
                          <div className="mt-1 rounded-lg border border-line bg-canvas p-2.5">
                            <SourceExcerpt text={t.source_excerpt} highlightTerms={t.highlight_terms} />
                          </div>
                        </details>
                      )}
                      {t.ai_score != null &&
                        (() => {
                          const color = criterionColor(t.ai_criterion, review.grade.details);
                          return (
                            <div className={`mt-2 rounded-lg border ${color.border} ${color.bg} px-3 py-2`}>
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-xs font-bold ${color.text}`}>
                                  Score: {t.ai_score} / {t.ai_max_score ?? 10}
                                </p>
                                {t.ai_criterion && (
                                  <span className={`flex items-center gap-1.5 text-xs font-medium ${color.text}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
                                    {t.ai_criterion}
                                  </span>
                                )}
                              </div>
                              {t.ai_feedback && <p className="mt-1 text-xs text-ink">{t.ai_feedback}</p>}
                            </div>
                          );
                        })()}
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* sidebar column — sticky so it stays usefully visible instead
                of ending partway down and leaving a blank void next to a
                long transcript (lg:self-start is required for sticky to
                have room to move: grid items stretch to row height by
                default, which otherwise defeats sticky entirely). */}
            <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
              <Card className="p-5">
                <div className="flex flex-wrap gap-2">
                  {(review.grade.status === "ai_graded" || review.grade.status === "instructor_review") && (
                    <Button onClick={finalize} disabled={transitioning} className="flex-1">
                      <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
                      Finalize
                    </Button>
                  )}
                  {review.grade.status === "finalized" && (
                    <Button onClick={() => setPublishConfirmOpen(true)} disabled={transitioning} className="flex-1">
                      <Rocket className="h-4 w-4" strokeWidth={2} />
                      Publish to student
                    </Button>
                  )}
                  {review.grade.status === "published" && (
                    <Badge tone="success">Published to student</Badge>
                  )}
                </div>

                {review.grade.status === "published" && resultsLink && (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Results link</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      Share this with the student — no login needed to view it.
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <Input readOnly value={resultsLink} className="text-xs" />
                      <Button size="sm" variant="secondary" onClick={copyResultsLink}>
                        {resultsLinkCopied ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2} />
                        ) : (
                          <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Rubric criteria</p>
                <p className="mt-1 text-xs text-ink-soft/80">
                  AI-derived from the matching tagged questions in the transcript. Edit a box to override it.
                </p>
                <div className="mt-3 flex flex-col gap-4">
                  {review.grade.details.map((d) => {
                    const color = criterionColor(d.criterion, review.grade.details);
                    return (
                      <div
                        key={d.id}
                        className={`border-l-[3px] ${color.border} border-b border-b-line pb-3 pl-3 last:border-b-0 last:pb-0`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                            <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
                            {d.criterion}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <ScoreInput
                              max={d.max_score}
                              value={criterionScores[d.criterion] ?? ""}
                              onChange={(v) => setCriterionScores((prev) => ({ ...prev, [d.criterion]: v }))}
                            />
                            <span className="text-xs font-medium text-ink-soft">/ {d.max_score}</span>
                          </div>
                        </div>
                        {d.evidence_text && (
                          <p className="mt-1.5 text-xs italic text-ink-soft">&quot;{d.evidence_text}&quot;</p>
                        )}
                        {d.reasoning && <p className="mt-1 text-xs text-ink-soft">{d.reasoning}</p>}
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="border-2 border-line p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Instructor override</p>
                <p className="mt-1 text-xs text-ink-soft/80">
                  Changes here become what the student sees once published — separate from the AI&apos;s own output
                  above.
                </p>

                <div className="mt-4">
                  <Label htmlFor="instructor-score">Override score (out of {review.grade.ai_max_score ?? 100})</Label>
                  <Input
                    id="instructor-score"
                    type="number"
                    min={0}
                    max={review.grade.ai_max_score ?? 100}
                    value={instructorScore}
                    onChange={(e) => setInstructorScore(e.target.value)}
                    className="w-28"
                  />
                </div>

                <div className="mt-3">
                  <Label htmlFor="instructor-feedback">Feedback for student (optional)</Label>
                  <Textarea
                    id="instructor-feedback"
                    rows={3}
                    placeholder="Shown to the student alongside the AI's feedback once published."
                    value={instructorFeedback}
                    onChange={(e) => setInstructorFeedback(e.target.value)}
                  />
                </div>

                <div className="mt-3">
                  <Label htmlFor="reason">Internal note (required — audit trail only, not shown to student)</Label>
                  <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>

                <Button onClick={saveOverride} disabled={saving} variant="secondary" className="mt-3 w-full">
                  {saving ? "Saving..." : "Save override"}
                </Button>
              </Card>

              {context?.has_end_photo && (
                <Card className="p-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">End-of-exam photo</p>
                  <p className="mt-1 text-xs text-ink-soft/80">
                    Taken right after the exam ended, to confirm the same person finished the session.
                  </p>
                  {endPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={endPhotoUrl} alt="End-of-exam" className="mt-3 w-full rounded-lg border border-line" />
                  ) : (
                    <Button variant="secondary" size="sm" onClick={loadEndPhoto} className="mt-3 w-full">
                      View photo
                    </Button>
                  )}
                </Card>
              )}

              {auditLog.length > 0 && (
                <div>
                  <button
                    onClick={() => setAuditLogOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-sm font-bold text-ink-soft hover:text-ink"
                  >
                    <History className="h-3.5 w-3.5" strokeWidth={2} />
                    {auditLogOpen ? "Hide" : "Show"} audit history ({auditLog.length})
                  </button>
                  {auditLogOpen && (
                    <Card className="mt-3 p-5">
                      <div className="flex flex-col gap-4">
                        {auditLog.map((e) => (
                          <div key={e.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                            <p className="text-sm font-bold text-ink">{e.action.replace("_", " ")}</p>
                            <p className="text-xs text-ink-soft">
                              {e.actor_email} &middot; {new Date(e.timestamp).toLocaleString()}
                            </p>
                            {e.reason && <p className="mt-1 text-xs text-ink-soft">Reason: {e.reason}</p>}
                            {e.old_value && (
                              <p className="mt-1 text-xs text-ink-soft">Before: {JSON.stringify(e.old_value)}</p>
                            )}
                            {e.new_value && (
                              <p className="mt-0.5 text-xs text-ink-soft">After: {JSON.stringify(e.new_value)}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      </div>

      <ConfirmDialog
        open={publishConfirmOpen}
        onClose={() => setPublishConfirmOpen(false)}
        onConfirm={publish}
        busy={transitioning}
        title="Publish this grade to the student?"
        description="The student will immediately be able to see their score and feedback. This can't be un-published from here."
        confirmLabel="Publish grade"
      />
    </>
  );
}
