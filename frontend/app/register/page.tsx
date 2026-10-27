"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { apiFetchJson, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetchJson("/auth/register", { email, password });
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
            <GraduationCap className="h-5 w-5" strokeWidth={2} />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">Create an instructor account</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Students don&apos;t need an account — they join an exam through the link and passcode you share.
          </p>
        </div>

        <Card className="p-7">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-ink-soft">At least 8 characters</p>
            </div>

            <FieldError>{error}</FieldError>

            <Button type="submit" disabled={submitting} className="mt-1 w-full">
              {submitting ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-sky-600 hover:text-sky-500">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
