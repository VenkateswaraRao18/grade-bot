"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "./api";
import { clearToken, getToken, CurrentUser, UserRole } from "./auth";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Fetches the current user once per portal layout (not per page) and redirects
 * to /login if unauthenticated, or to the user's own portal if requiredRole
 * doesn't match. This is UX-only gating — the backend enforces access control
 * per-endpoint regardless. */
export function AuthProvider({
  requiredRole,
  children,
}: {
  requiredRole: UserRole;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    apiFetch<CurrentUser>("/auth/me", { token })
      .then((me) => {
        if (me.role !== requiredRole) {
          // Only "instructor" is ever a requiredRole now (CLAUDE.md pivot:
          // no student portal), so this just catches a stale/unexpected
          // token rather than branching to a real destination.
          router.replace("/login");
          return;
        }
        setUser(me);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) clearToken();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    clearToken();
    router.push("/login");
  }

  return <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
