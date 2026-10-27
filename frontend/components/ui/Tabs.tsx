"use client";

import { cn } from "@/lib/cn";

interface TabItem {
  key: string;
  label: string;
}

export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 border-b border-line", className)}>
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={cn(
            "relative px-3 py-2.5 text-sm font-medium transition-colors",
            active === item.key ? "text-ink" : "text-ink-soft hover:text-ink"
          )}
        >
          {item.label}
          {active === item.key && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-sky-600" />
          )}
        </button>
      ))}
    </div>
  );
}
