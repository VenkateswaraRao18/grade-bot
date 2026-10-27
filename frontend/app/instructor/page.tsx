"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Database,
  GraduationCap,
  Info,
  Mic,
  Plus,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { ApiUsage, InstructorStats, PendingReview } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";

const PREVIEW_COUNT = 4;

function formatUsd(n: number | null): string {
  if (n === null) return "—";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

export default function InstructorOverviewPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<InstructorStats | null>(null);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    Promise.all([
      apiFetch<InstructorStats>("/instructor/stats", { token }),
      apiFetch<PendingReview[]>("/instructor/attempts/pending-review", { token }),
      apiFetch<ApiUsage>("/instructor/usage", { token }),
    ])
      .then(([s, p, u]) => {
        setStats(s);
        setPendingReviews(p);
        setUsage(u);
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || loading || !stats) return <PageSpinner />;

  const preview = pendingReviews.slice(0, PREVIEW_COUNT);

  return (
    <>
      <div className="border-b border-line px-6 py-8 sm:px-8">
        <div className="flex w-full flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
              Welcome back,
              <br />
              {user.email}
            </h1>
            <p className="mt-3 max-w-xl text-sm text-ink-soft">
              Create exams, conduct AI-powered oral examinations, and review student performance.
            </p>
          </div>
          <Link href="/instructor/exams/new" className="shrink-0">
            <Button>
              <Plus className="h-4 w-4" strokeWidth={2} />
              New Exam
            </Button>
          </Link>
        </div>
      </div>

      <div className="w-full px-6 py-8 sm:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={ClipboardList}
            label="Exams"
            value={stats.exam_count}
            description="Total exams created"
            tone="success"
          />
          <StatCard
            icon={GraduationCap}
            label="Completed attempts"
            value={stats.completed_attempt_count}
            description="Student exam attempts completed"
            tone="accent"
          />
          <StatCard
            icon={Sparkles}
            label="Published grades"
            value={stats.published_grade_count}
            description="Grades released to students"
            tone="ink"
          />
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-warn" strokeWidth={2} />
              <h2 className="text-sm font-semibold text-ink">Pending review</h2>
              {pendingReviews.length > 0 && <Badge tone="warning">{pendingReviews.length}</Badge>}
            </div>
            {pendingReviews.length > PREVIEW_COUNT && (
              <Link
                href="/instructor/review"
                className="flex items-center gap-0.5 text-xs font-semibold text-sky-600 hover:text-sky-700"
              >
                View all
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
              </Link>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Students have completed these exams. Nothing is graded until you review it.
          </p>

          <div className="mt-3">
            {pendingReviews.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Nothing waiting on you"
                description="Completed exam attempts that still need grading will show up here."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {preview.map((r) => (
                  <Link key={r.attempt_id} href={`/instructor/attempts/${r.attempt_id}/grade`}>
                    <div className="group flex items-center justify-between gap-3 rounded-xl border border-warn/25 bg-warn-soft/50 p-4 transition-colors hover:border-warn/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">
                          {r.student_email} — {r.exam_name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                          <span>Completed {new Date(r.ended_at).toLocaleString()}</span>
                          {r.ended_reason === "integrity_violation" && (
                            <Badge tone="warning">
                              <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                              Left early
                            </Badge>
                          )}
                          {r.ended_reason === "missing_submission" && (
                            <Badge tone="warning">
                              <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                              Missing document
                            </Badge>
                          )}
                          {r.grade_status && <Badge tone="neutral">{r.grade_status.replace("_", " ")}</Badge>}
                        </div>
                      </div>
                      {r.ai_score != null && (
                        <div className="shrink-0 text-right">
                          <p className="font-[family-name:var(--font-mono)] text-lg font-semibold text-ink">
                            {r.ai_score}
                            <span className="text-xs font-medium text-ink-soft"> / {r.ai_max_score ?? 100}</span>
                          </p>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                            AI score
                          </p>
                        </div>
                      )}
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-ink-soft/50 transition-colors group-hover:text-warn"
                        strokeWidth={2}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {usage && (
          <div className="mt-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-ink-soft" strokeWidth={2} />
                <h2 className="text-sm font-semibold text-ink">API usage</h2>
              </div>
              <Link
                href="/instructor/usage"
                className="flex items-center gap-0.5 text-xs font-semibold text-sky-600 hover:text-sky-700"
              >
                <CircleDollarSign className="h-3.5 w-3.5" strokeWidth={2} />
                View usage & costs
              </Link>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              Audit trail of AI provider spend across every exam — not a per-exam breakdown.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-accent" strokeWidth={2} />
                    <p className="text-sm font-semibold text-ink">Claude</p>
                    <Badge tone="neutral">{usage.claude.model}</Badge>
                  </div>
                  <p className="font-[family-name:var(--font-mono)] text-lg font-semibold text-ink">
                    {formatUsd(usage.claude.total_estimated_cost_usd)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {usage.claude.total_calls} {usage.claude.total_calls === 1 ? "call" : "calls"} ·{" "}
                  {usage.claude.total_input_tokens.toLocaleString()} in /{" "}
                  {usage.claude.total_output_tokens.toLocaleString()} out tokens
                </p>

                {usage.claude.by_call_type.length > 0 && (
                  <div className="mt-3 flex flex-col divide-y divide-line border-t border-line">
                    {usage.claude.by_call_type.map((row) => (
                      <div key={row.call_type} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-ink-soft">
                          {row.call_type === "examiner_question"
                            ? "Exam questions"
                            : row.call_type === "warmup_question"
                              ? "Warm-up questions"
                              : row.call_type === "grading"
                                ? "Grading"
                                : row.call_type}
                          <span className="ml-1.5 text-xs text-ink-soft/70">× {row.call_count}</span>
                        </span>
                        <span className="font-[family-name:var(--font-mono)] font-medium text-ink">
                          {formatUsd(row.estimated_cost_usd)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2.5">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-ink" strokeWidth={2} />
                  <p className="text-[11px] leading-relaxed text-success-ink">
                    {usage.claude.note}
                    {usage.claude.has_unpriced_calls &&
                      " Some calls used a model not in our pricing table — shown as — above."}
                  </p>
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                    <p className="text-sm font-semibold text-ink">ElevenLabs (voice)</p>
                    {usage.elevenlabs?.tier && <Badge tone="neutral">{usage.elevenlabs.tier}</Badge>}
                  </div>
                </div>

                {usage.elevenlabs ? (
                  <>
                    <p className="mt-1 text-xs text-ink-soft">
                      {usage.elevenlabs.characters_used.toLocaleString()} /{" "}
                      {usage.elevenlabs.characters_limit.toLocaleString()} characters used this period
                    </p>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${Math.min(
                            100,
                            (usage.elevenlabs.characters_used / Math.max(usage.elevenlabs.characters_limit, 1)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {usage.elevenlabs.characters_remaining?.toLocaleString() ?? "—"} characters remaining
                    </p>
                    <p className="mt-3 text-[11px] leading-relaxed text-ink-soft/80">
                      Pulled live from ElevenLabs&apos; own account API on every load — not something we track
                      ourselves, since they already expose real remaining quota.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-ink-soft">
                    {usage.elevenlabs_error ?? "ElevenLabs isn't configured."}
                  </p>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
