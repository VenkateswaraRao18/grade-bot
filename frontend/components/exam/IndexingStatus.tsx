import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { BulkSubmissionResult } from "@/lib/types";
import { Progress } from "@/components/ui/Progress";

/** Shown after a bulk submission upload — the upload response itself comes
 * back before indexing starts (see routers/submissions.py), so this is the
 * only visible sign that something is still happening in the background. */
export function IndexingStatus({
  result,
  indexedCount,
}: {
  result: BulkSubmissionResult;
  indexedCount: number | null;
}) {
  const total = result.submission_ids.length;
  const isDone = total === 0 || (indexedCount !== null && indexedCount >= total);

  return (
    <div
      className={cn(
        "mt-2 flex items-center gap-2.5 rounded-lg border px-3 py-2.5",
        isDone ? "border-emerald-200 bg-emerald-50" : "border-sky-200 bg-sky-50"
      )}
    >
      {isDone ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />
      ) : (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" strokeWidth={2} />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-xs font-semibold", isDone ? "text-emerald-900" : "text-sky-900")}>
          {result.created} added, {result.updated} updated
          {total > 0 &&
            (isDone ? " — all indexed." : ` — indexing ${indexedCount ?? 0} of ${total}...`)}
        </p>
        {!isDone && total > 0 && (
          <Progress value={indexedCount ?? 0} max={total} className="mt-1.5" />
        )}
      </div>
    </div>
  );
}
