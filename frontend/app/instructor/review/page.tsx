"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, ClipboardCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { PendingReview } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";

export default function ReviewQueuePage() {
  const { user } = useAuth();
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    apiFetch<PendingReview[]>("/instructor/attempts/pending-review", { token })
      .then(setPendingReviews)
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || loading) return <PageSpinner />;

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Students have completed these exams. Nothing is graded until you review it."
        maxWidth="max-w-none"
      />

      <div className="w-full px-6 py-8 sm:px-8">
        {pendingReviews.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="Nothing waiting on you"
            description="Completed exam attempts that still need grading will show up here."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {pendingReviews.map((r) => (
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
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">AI score</p>
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
    </>
  );
}
