import { LucideIcon } from "lucide-react";
import { Card } from "./Card";
import { cn } from "@/lib/cn";

type Tone = "success" | "accent" | "ink";

const toneClasses: Record<Tone, string> = {
  success: "bg-emerald-50 text-emerald-600",
  accent: "bg-accent-soft text-accent",
  ink: "bg-sky-50 text-sky-600",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  description,
  tone = "ink",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  description?: string;
  tone?: Tone;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3.5">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", toneClasses[tone])}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-mono)] text-2xl font-semibold tracking-tight text-ink">
            {value}
          </p>
          <p className="text-sm font-medium text-ink">{label}</p>
          {description && <p className="mt-0.5 text-xs text-ink-soft">{description}</p>}
        </div>
      </div>
    </Card>
  );
}
