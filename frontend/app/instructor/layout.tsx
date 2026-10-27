"use client";

import { AuthProvider } from "@/lib/AuthContext";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider requiredRole="instructor">
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
