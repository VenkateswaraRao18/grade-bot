"use client";

import { useEffect, useRef, useState } from "react";
import { LucideIcon, MoreVertical } from "lucide-react";
import { cn } from "@/lib/cn";

export interface MoreMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  danger?: boolean;
}

/** A compact overflow menu for secondary actions that don't need equal
 * visual weight to the page's primary content — e.g. Edit/Delete on a
 * record whose main job, once it has real activity, is to be looked at
 * rather than administered. */
export function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        aria-expanded={open}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
      >
        <MoreVertical className="h-4 w-4" strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-canvas",
                item.danger ? "text-red-600" : "text-ink"
              )}
            >
              {item.icon && <item.icon className="h-3.5 w-3.5" strokeWidth={2} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
