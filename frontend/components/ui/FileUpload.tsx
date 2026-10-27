"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/cn";

interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  onFilesSelected: (files: FileList) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}

/** A styled dropzone (click or drag-and-drop) wrapping a hidden file input.
 * Reports selected files via onFilesSelected rather than holding its own
 * selection state — the caller already owns "what's selected / uploading /
 * uploaded" state for its specific upload flow (bulk mapping, reference
 * material, etc.), so this stays a dumb, reusable input. */
export function FileUpload({
  accept,
  multiple,
  onFilesSelected,
  label,
  hint,
  disabled,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    if (files && files.length > 0) onFilesSelected(files);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
        dragOver ? "border-sky-500 bg-sky-50" : "border-line bg-canvas/50 hover:bg-canvas",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
        className
      )}
    >
      <Upload className="h-5 w-5 text-ink-soft" strokeWidth={1.75} />
      <p className="text-sm font-medium text-ink">{label}</p>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />
    </div>
  );
}
