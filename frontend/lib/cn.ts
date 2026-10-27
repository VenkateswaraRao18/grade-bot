import { twMerge } from "tailwind-merge";

// Plain string-join previously, which meant a later conflicting Tailwind
// utility (e.g. a page overriding Card's default `border-zinc-300` with
// `border-sky-200`) silently lost depending on Tailwind's internal
// stylesheet order, not className order — confirmed broken on at least two
// real cards (a pending-review tint, an "I have read..." card border)
// before this fix.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
