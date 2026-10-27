"use client";

import { Sidebar } from "./Sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  // h-screen (an absolute viewport unit) instead of min-h-full — the old
  // min-h-full/min-height chain never resolved to a real pixel value
  // through body's min-h-full (percentage heights don't resolve against
  // an ancestor whose own height is itself just min-height + content), so
  // the sidebar's h-full silently fell back to its own content height
  // instead of the full page. h-screen sidesteps the whole ancestor-chain
  // problem. Only the content pane scrolls internally (overflow-y-auto) —
  // the sidebar stays fixed at exactly the viewport height.
  //
  // flex-col on mobile (sidebar collapses to a top bar, stacks above
  // content) vs. flex-row on desktop (sidebar beside content).
  return (
    <div className="flex h-screen flex-col bg-canvas lg:flex-row">
      <Sidebar />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
