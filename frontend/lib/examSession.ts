// The passcode-link flow has no student login, so a live exam attempt is
// authenticated by a short-lived, attempt-scoped bearer token instead of the
// global login JWT (see lib/auth.ts) — issued by POST /public/start and
// valid only for that one attempt_id. Stored per-attempt in sessionStorage
// (not localStorage): it doesn't need to outlive this tab, and re-entering
// through the passcode flow again reissues a fresh one for the same
// in-progress attempt if a student needs to resume in a new tab.
const PREFIX = "oral_exam_session_";

export function setExamSessionToken(attemptId: string, token: string): void {
  window.sessionStorage.setItem(PREFIX + attemptId, token);
}

export function getExamSessionToken(attemptId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(PREFIX + attemptId);
}
