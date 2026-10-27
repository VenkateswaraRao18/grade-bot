"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { BulkSubmissionResult } from "@/lib/types";
import { extractCanvasUserId, parseGradebookCsv } from "@/lib/gradebookMatch";
import { UPLOAD_ACCEPT, UPLOAD_HINT } from "@/lib/fileTypes";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";
import { Input } from "@/components/ui/Input";

const GRADEBOOK_ACCEPT = ".csv,text/csv";

interface MatchRow {
  filename: string;
  file: File;
  matchedName: string | null;
  sisUserId: string;
}

export function GradebookMatchUpload({
  examId,
  onUploaded,
}: {
  examId: string;
  onUploaded: () => void;
}) {
  const [gradebookError, setGradebookError] = useState<string | null>(null);
  const [gradebookRowCount, setGradebookRowCount] = useState<number | null>(null);
  const [idMap, setIdMap] = useState<Map<string, { name: string; sisUserId: string }> | null>(null);

  const [rows, setRows] = useState<MatchRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkSubmissionResult | null>(null);

  function handleGradebookFile(files: FileList) {
    const file = files[0];
    if (!file) return;
    setGradebookError(null);
    setGradebookRowCount(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseGradebookCsv(String(reader.result ?? ""));
      if (!parsed) {
        setIdMap(null);
        setGradebookError(
          'Could not find "ID", "SIS User ID", and "Student" columns in that file — make sure it\'s a Canvas Gradebook export CSV.'
        );
        return;
      }
      setIdMap(parsed);
      setGradebookRowCount(parsed.size);
      if (rows.length > 0) matchFiles(rows.map((r) => r.file), parsed);
    };
    reader.readAsText(file);
  }

  function matchFiles(files: File[], map: Map<string, { name: string; sisUserId: string }> | null) {
    setRows(
      files.map((file) => {
        const canvasId = extractCanvasUserId(file.name);
        const match = canvasId && map ? map.get(canvasId) : undefined;
        return {
          filename: file.name,
          file,
          matchedName: match?.name ?? null,
          sisUserId: match?.sisUserId ?? "",
        };
      })
    );
    setResult(null);
    setUploadError(null);
  }

  function handleStudentFiles(files: FileList) {
    matchFiles(Array.from(files), idMap);
  }

  function updateRowId(filename: string, sisUserId: string) {
    setRows((prev) => prev.map((r) => (r.filename === filename ? { ...r, sisUserId } : r)));
  }

  const matchedCount = rows.filter((r) => r.sisUserId.trim()).length;
  const unmatchedCount = rows.length - matchedCount;

  async function handleUpload() {
    const usable = rows.filter((r) => r.sisUserId.trim());
    if (usable.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const mappingCsv =
        "student_id_number,filename\n" +
        usable.map((r) => `"${r.sisUserId.trim()}","${r.filename.replace(/"/g, '""')}"`).join("\n");
      const mappingFile = new File([mappingCsv], "mapping.csv", { type: "text/csv" });

      const formData = new FormData();
      usable.forEach((r) => formData.append("files", r.file));
      formData.append("mapping_file", mappingFile);

      const token = getToken() ?? undefined;
      const res = await apiFetch<BulkSubmissionResult>(`/exams/${examId}/bulk-submissions`, {
        method: "POST",
        body: formData,
        token,
      });
      setResult(res);
      setRows([]);
      onUploaded();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Could not upload documents.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FileUpload
            label="Canvas gradebook CSV"
            hint="Export with ID + SIS User ID columns"
            accept={GRADEBOOK_ACCEPT}
            onFilesSelected={handleGradebookFile}
          />
          {gradebookRowCount != null && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {gradebookRowCount} students found
            </p>
          )}
          {gradebookError && (
            <p className="mt-1.5 flex items-start gap-1 text-xs text-red-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {gradebookError}
            </p>
          )}
        </div>
        <div>
          <FileUpload
            label="Student submission files"
            hint={UPLOAD_HINT}
            accept={UPLOAD_ACCEPT}
            multiple
            onFilesSelected={handleStudentFiles}
          />
          {rows.length > 0 && (
            <p className="mt-1.5 text-xs font-medium text-ink">
              {rows.length} file{rows.length === 1 ? "" : "s"} selected
            </p>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line bg-canvas px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <FileSpreadsheet className="h-3.5 w-3.5 text-ink-soft" strokeWidth={1.75} />
              {matchedCount} matched{unmatchedCount > 0 && `, ${unmatchedCount} need a U-number`}
            </p>
          </div>
          <div className="flex max-h-80 flex-col divide-y divide-line overflow-y-auto">
            {rows.map((r) => (
              <div key={r.filename} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink">{r.filename}</p>
                  {r.matchedName && <p className="truncate text-xs text-ink-soft">{r.matchedName}</p>}
                </div>
                <Input
                  value={r.sisUserId}
                  onChange={(e) => updateRowId(r.filename, e.target.value)}
                  placeholder="U-number"
                  className={`w-36 shrink-0 text-xs ${r.sisUserId.trim() ? "" : "border-warn/40"}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <Button size="sm" onClick={handleUpload} disabled={matchedCount === 0 || uploading}>
          {uploading ? "Uploading..." : `Upload ${matchedCount} document${matchedCount === 1 ? "" : "s"}`}
        </Button>
        {unmatchedCount > 0 && (
          <p className="mt-1.5 text-xs text-ink-soft">
            {unmatchedCount} file{unmatchedCount === 1 ? "" : "s"} couldn&apos;t be matched automatically — fill in
            a U-number by hand or they&apos;ll be skipped.
          </p>
        )}
      </div>

      {uploadError && <p className="whitespace-pre-wrap text-xs text-red-600">{uploadError}</p>}
      {result && (
        <p className="text-xs text-emerald-700">
          {result.created} added, {result.updated} updated
          {result.failed_indexing.length > 0 && `, ${result.failed_indexing.length} failed to index`}.
        </p>
      )}
    </div>
  );
}
