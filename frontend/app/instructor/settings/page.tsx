"use client";

import { LogOut, Mail, ShieldCheck, UserCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/PageHeader";

function Row({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50">
        <Icon className="h-4.5 w-4.5 text-sky-600" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-soft">{label}</p>
        <p className="truncate text-sm font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();

  if (!user) return <PageSpinner />;

  return (
    <>
      <PageHeader title="Settings" description="Your account." maxWidth="max-w-2xl" />

      <div className="mx-auto w-full max-w-2xl px-6 py-8 sm:px-8">
        <Card className="p-5">
          <div className="flex flex-col divide-y divide-line">
            <Row icon={Mail} label="Email" value={user.email} />
            <Row icon={UserCircle} label="Role" value="Instructor" />
            <Row
              icon={ShieldCheck}
              label="Account created"
              value={new Date(user.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            />
          </div>
        </Card>

        <Button variant="secondary" onClick={logout} className="mt-6">
          <LogOut className="h-4 w-4" strokeWidth={2} />
          Log out
        </Button>
      </div>
    </>
  );
}
