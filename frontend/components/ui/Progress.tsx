import { cn } from "@/lib/cn";

type Tone = "accent" | "success" | "ink";

const toneClasses: Record<Tone, string> = {
  accent: "bg-accent",
  success: "bg-emerald-600",
  ink: "bg-sky-600",
};

export function Progress({
  value,
  max = 100,
  tone = "accent",
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-canvas", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-200", toneClasses[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
