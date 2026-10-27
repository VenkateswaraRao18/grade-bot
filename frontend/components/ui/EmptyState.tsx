import { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-line bg-canvas/40 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface ring-1 ring-line">
        <Icon className="h-5 w-5 text-ink-soft" strokeWidth={1.75} />
      </div>
      <p className="mt-4 text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
