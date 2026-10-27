const TOKEN_KEY = "oral_access_token";

export type UserRole = "student" | "instructor";

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  student_id_number: string | null;
  id_verified: boolean;
  created_at: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}
