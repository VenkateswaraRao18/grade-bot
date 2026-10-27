// Deliberately outside the /student route group and its DashboardShell — a
// live exam shouldn't show the app's normal navigation chrome at all. This
// is the dedicated, full-bleed "exam mode" experience (see the page itself
// for the full-screen lock/exit-detection that pairs with it).
//
// No AuthProvider here (CLAUDE.md pivot: no student login) — the page
// itself authenticates against the per-attempt session token from
// lib/examSession.ts, set by the passcode flow right before redirecting in.
export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
