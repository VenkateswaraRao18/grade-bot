import { cn } from "@/lib/cn";

type Tone = "success" | "warning" | "neutral" | "accent";

const toneClasses: Record<Tone, string> = {
  success: "bg-success-soft text-success-ink border border-success-ink/15",
  warning: "bg-warn-soft text-warn border border-warn/15",
  neutral: "bg-canvas text-ink-soft border border-line",
  accent: "bg-accent-soft text-accent border border-accent/20",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold",
        toneClasses[tone]
      )}
    >
      {children}
    </span>
  );
}
