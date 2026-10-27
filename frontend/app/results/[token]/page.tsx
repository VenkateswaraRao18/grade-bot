"use client";

import { use, useEffect, useState } from "react";
import { Award, GraduationCap, XCircle } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { SourceExcerpt } from "@/components/exam/SourceExcerpt";
import { PublicResults, GradingDetail } from "@/lib/types";

// Matches the instructor-facing grade-review page's palette exactly — same
// underlying grade, same criterion colors, so a student comparing notes
// with their instructor sees the same visual language.
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

export default function PublicResultsPage(props: PageProps<"/results/[token]">) {
  const { token } = use(props.params);
  const [results, setResults] = useState<PublicResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<PublicResults>(`/public/results/${token}`)
      .then(setResults)
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 404
            ? "This results link isn't available — it may not be published yet, or the link may be incorrect."
            : "Could not load these results."
        );
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <PageSpinner />;

  if (error || !results) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <XCircle className="h-6 w-6 text-red-500" strokeWidth={1.75} />
        </div>
        <h1 className="mt-4 text-lg font-bold text-ink">Results not available</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="border-b border-line bg-surface px-6 py-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-600/15">
            <GraduationCap className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-tight text-ink">{results.exam_name}</p>
            {results.candidate_name && (
              <p className="truncate text-sm text-ink-soft">{results.candidate_name}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8">
        <Card className="border-2 border-accent/30 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Your score</p>
            <Badge tone="success">Published</Badge>
          </div>
          <p className="mt-2 font-[family-name:var(--font-mono)] text-5xl font-semibold tracking-tight text-ink">
            {results.score ?? "—"}
            <span className="text-lg font-medium text-ink-soft"> / {results.max_score ?? 100}</span>
          </p>

          {results.strengths && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Strengths</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{results.strengths}</p>
            </div>
          )}
          {results.weaknesses && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Areas to improve</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{results.weaknesses}</p>
            </div>
          )}
          {results.instructor_feedback && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Instructor&apos;s note</p>
              <p className="mt-1.5 text-sm leading-relaxed text-emerald-900">{results.instructor_feedback}</p>
            </div>
          )}
        </Card>

        {results.details.length > 0 && (
          <Card className="mt-6 p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Rubric breakdown</p>
            <div className="mt-3 flex flex-col gap-4">
              {results.details.map((d) => {
                const color = criterionColor(d.criterion, results.details);
                return (
                  <div
                    key={d.id}
                    className={`border-l-[3px] ${color.border} border-b border-b-line pb-3 pl-3 last:border-b-0 last:pb-0`}
                  >
                    <div className="flex items-center gap-2">
                      <Award className={`h-4 w-4 ${color.text}`} strokeWidth={1.75} />
                      <span className="text-sm font-semibold text-ink">{d.criterion}</span>
                      <span className={`ml-auto font-[family-name:var(--font-mono)] text-sm font-bold ${color.text}`}>
                        {d.score} / {d.max_score}
                      </span>
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
        )}

        <Card className="mt-6 p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Transcript</p>
          <div className="mt-3 flex flex-col gap-4">
            {results.transcript.map((t) => (
              <div key={t.sequence} className="border-b border-line pb-4 last:border-0 last:pb-0">
                <p className="text-sm font-bold text-ink">
                  Q{t.sequence}
                  {!t.is_graded && <span className="ml-2 text-xs font-normal text-ink-soft">(warm-up — not graded)</span>}
                  {t.is_followup && <span className="ml-2 text-xs font-normal text-ink-soft">(follow-up)</span>}
                  {t.is_generalization && (
                    <span className="ml-2 text-xs font-normal text-sky-600">(bigger picture)</span>
                  )}
                  : {t.question}
                </p>
                <p className="mt-1.5 text-sm text-ink-soft">You answered: {t.answer ?? "(no answer recorded)"}</p>
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
                    const color = criterionColor(t.ai_criterion, results.details);
                    return (
                      <div className={`mt-2 rounded-lg border ${color.border} ${color.bg} px-3 py-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className={`font-[family-name:var(--font-mono)] text-xs font-bold ${color.text}`}>
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

        {results.published_at && (
          <p className="mt-6 text-center text-xs text-ink-soft">
            Published {new Date(results.published_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
