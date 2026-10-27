import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-1 items-center justify-center py-24", className)}>
      <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
    </div>
  );
}
