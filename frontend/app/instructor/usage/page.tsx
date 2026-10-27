"use client";

import { useEffect, useState } from "react";
import { Info, Layers, Mic, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { ApiUsage } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";

const CALL_TYPE_LABEL: Record<string, string> = {
  examiner_question: "Exam questions",
  warmup_question: "Warm-up questions",
  grading: "Grading",
  material_indexing: "Reference material indexing",
  material_query: "Reference material retrieval",
  submission_indexing: "Student document indexing",
  submission_query: "Student document retrieval",
};

function formatUsd(n: number | null): string {
  if (n === null) return "—";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

export default function UsagePage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const token = getToken() ?? undefined;
    apiFetch<ApiUsage>("/instructor/usage", { token })
      .then(setUsage)
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || loading || !usage) return <PageSpinner />;

  return (
    <>
      <PageHeader
        title="Usage & costs"
        description="Audit trail of AI provider spend across every exam — platform-wide, not a per-exam breakdown."
        maxWidth="max-w-6xl"
      />

      <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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
                      {CALL_TYPE_LABEL[row.call_type] ?? row.call_type}
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
                <Layers className="h-4 w-4 text-sky-600" strokeWidth={2} />
                <p className="text-sm font-semibold text-ink">Gemini (embeddings)</p>
                {usage.gemini && <Badge tone="neutral">{usage.gemini.model}</Badge>}
              </div>
              {usage.gemini && (
                <p className="font-[family-name:var(--font-mono)] text-lg font-semibold text-ink">
                  {formatUsd(usage.gemini.total_estimated_cost_usd)}
                </p>
              )}
            </div>

            {usage.gemini ? (
              <>
                <p className="mt-1 text-xs text-ink-soft">
                  {usage.gemini.total_calls} {usage.gemini.total_calls === 1 ? "call" : "calls"} ·{" "}
                  {usage.gemini.total_input_tokens.toLocaleString()} input tokens (estimated)
                </p>

                {usage.gemini.by_call_type.length > 0 && (
                  <div className="mt-3 flex flex-col divide-y divide-line border-t border-line">
                    {usage.gemini.by_call_type.map((row) => (
                      <div key={row.call_type} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-ink-soft">
                          {CALL_TYPE_LABEL[row.call_type] ?? row.call_type}
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
                    {usage.gemini.note}
                    {usage.gemini.has_unpriced_calls &&
                      " Some calls used a model not in our pricing table — shown as — above."}
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">
                Gemini isn&apos;t configured — embeddings are running on the local Ollama model instead, which
                has no API cost to track.
              </p>
            )}
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
                <Progress
                  className="mt-3"
                  tone="success"
                  value={usage.elevenlabs.characters_used}
                  max={Math.max(usage.elevenlabs.characters_limit, 1)}
                />
                <p className="mt-2 text-sm font-semibold text-ink">
                  {usage.elevenlabs.characters_remaining?.toLocaleString() ?? "—"} characters remaining
                </p>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-soft/80">
                  Pulled live from ElevenLabs&apos; own account API on every load — not something we track
                  ourselves, since they already expose real remaining quota.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">{usage.elevenlabs_error ?? "ElevenLabs isn't configured."}</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
