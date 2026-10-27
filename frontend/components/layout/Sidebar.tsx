"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  ClipboardList,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}

// Instructor-only (CLAUDE.md pivot: no student accounts/portal, and no
// Course/Module/Assignment hierarchy — an exam is the only thing an
// instructor creates, students join through its passcode link instead).
// Settings lives as its own icon near the account footer, not in this list
// — matches the reference design (see refimage/).
const NAV_ITEMS: NavItem[] = [
  { href: "/instructor", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/instructor/exams", label: "Exams", icon: ClipboardList },
  { href: "/instructor/review", label: "Review Queue", icon: ClipboardCheck },
  { href: "/instructor/usage", label: "Usage", icon: CircleDollarSign },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  if (!user) return null;
  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <div className="flex h-full flex-col bg-ink">
      <Link
        href="/instructor"
        onClick={onNavigate}
        className="flex flex-col items-center gap-2.5 px-5 pt-7 pb-6"
      >
        <span className="flex items-center justify-center rounded-lg bg-white px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/usf-logo.svg" alt="University of South Florida" className="h-7 w-auto" />
        </span>
        <span className="text-xs font-semibold tracking-[0.2em] text-white"></span>
      </Link>

      <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-800/60 text-[11px] font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">Instructor</p>
            <p className="truncate text-xs text-white/50">{user.email}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <Link
            href="/instructor/settings"
            onClick={onNavigate}
            title="Settings"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              pathname?.startsWith("/instructor/settings")
                ? "bg-white/10 text-white"
                : "text-white/50 hover:bg-white/10 hover:text-white"
            )}
          >
            <Settings className="h-4 w-4" strokeWidth={2} />
          </Link>
          <button
            onClick={logout}
            title="Log out"
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      {/* Desktop: persistent sidebar */}
      <aside className="hidden h-full w-[240px] shrink-0 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile: top bar + slide-in drawer */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-ink px-4 lg:hidden">
        <Link href="/instructor" className="flex items-center gap-2.5">
          <span className="flex items-center justify-center rounded-md bg-white px-2 py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/usf-logo.svg" alt="University of South Florida" className="h-5 w-auto" />
          </span>
          <span className="text-sm font-semibold tracking-[0.2em] text-white">ORAL</span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Menu className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-ink/50" onClick={() => setMobileOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-[260px]">
            <div className="relative h-full">
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4.5 w-4.5" strokeWidth={2} />
              </button>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
