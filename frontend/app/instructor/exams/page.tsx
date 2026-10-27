"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ClipboardList, Clock, ListChecks, Plus, Search, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { Exam } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/cn";

function StatPill({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink">
      <Icon className="h-3.5 w-3.5 text-sky-600" strokeWidth={2} />
      {label}
    </span>
  );
}

type StatusFilter = "all" | "draft" | "published";

export default function ExamsListPage() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    apiFetch<Exam[]>("/exams", { token })
      .then(setExams)
      .finally(() => setLoading(false));
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exams.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (!q) return true;
      return e.name.toLowerCase().includes(q) || (e.description ?? "").toLowerCase().includes(q);
    });
  }, [exams, query, statusFilter]);

  if (!user || loading) return <PageSpinner />;

  return (
    <>
      <PageHeader
        title="Exams"
        description="Every oral exam you've created — settings, student documents, and the passcode link all live on each exam's own page."
        action={
          <Link href="/instructor/exams/new">
            <Button>
              <Plus className="h-4 w-4" strokeWidth={2} />
              New exam
            </Button>
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-8">
        {exams.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No exams yet"
            description="Create your first exam to get started."
            action={
              <Link href="/instructor/exams/new">
                <Button>
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  New exam
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
                  strokeWidth={2}
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search exams..."
                  className="w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-3.5 text-sm text-ink placeholder:text-ink-soft/60 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
              <div className="flex gap-1.5">
                {(["all", "draft", "published"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs font-semibold capitalize transition-colors",
                      statusFilter === s
                        ? "bg-ink text-white"
                        : "border border-line bg-surface text-ink-soft hover:text-ink"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon={Search} title="No exams match" description="Try a different search or filter." />
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.map((exam) => (
                  <Link key={exam.id} href={`/instructor/exams/${exam.id}`}>
                    <Card className="p-5 transition-colors hover:border-sky-300">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-semibold text-ink">{exam.name}</p>
                            <Badge tone={exam.status === "published" ? "success" : "neutral"}>
                              {exam.status}
                            </Badge>
                          </div>
                          {exam.description && (
                            <p className="mt-1 truncate text-sm text-ink-soft">{exam.description}</p>
                          )}
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            <StatPill icon={Clock} label={`${exam.duration_minutes} min`} />
                            <StatPill
                              icon={BarChart3}
                              label={exam.difficulty[0].toUpperCase() + exam.difficulty.slice(1)}
                            />
                            <StatPill
                              icon={ListChecks}
                              label={`${exam.min_questions}–${exam.max_questions} questions`}
                            />
                            {exam.adaptive_enabled && <StatPill icon={Sparkles} label="Adaptive" />}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
