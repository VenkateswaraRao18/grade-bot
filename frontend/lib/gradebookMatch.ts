/** Matches bulk-downloaded Canvas submission files to students using a
 * Canvas Gradebook CSV export, instead of requiring the instructor to
 * hand-author a filename -> student_id_number mapping sheet.
 *
 * Canvas's "Download Submissions" naming scheme is
 * `{namesmashedtogether}_{canvasUserId}_{attachmentId}_{original filename}.ext`
 * — the first number is the same numeric ID Canvas's own gradebook export
 * uses in its "ID" column, right next to "SIS User ID" (the real
 * university ID). Joining on that number is an exact match, not a guess. */

export interface GradebookRow {
  name: string;
  sisUserId: string;
}

/** Minimal RFC4180-ish CSV parser (quoted fields, embedded commas, escaped
 * quotes) — gradebook exports quote names like "Acevedo Zeppenfeldt,
 * Marcela", so a naive split(",") would break on every row. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Parses a Canvas gradebook export into canvasUserId -> {name, sisUserId}.
 * Returns null if the CSV doesn't have the columns this relies on. */
export function parseGradebookCsv(text: string): Map<string, GradebookRow> | null {
  const rows = parseCsvText(text);
  if (rows.length < 2) return null;

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idCol = header.indexOf("id");
  const sisCol = header.indexOf("sis user id");
  const nameCol = header.indexOf("student");
  if (idCol === -1 || sisCol === -1 || nameCol === -1) return null;

  const result = new Map<string, GradebookRow>();
  for (const row of rows.slice(1)) {
    const canvasId = (row[idCol] ?? "").trim();
    const sisUserId = (row[sisCol] ?? "").trim();
    const name = (row[nameCol] ?? "").trim();
    if (!canvasId || !/^\d+$/.test(canvasId) || !sisUserId) continue;
    result.set(canvasId, { name, sisUserId });
  }
  return result.size > 0 ? result : null;
}

const CANVAS_SUBMISSION_FILENAME = /^[^_]+_(?:LATE_)?(\d+)_\d+_.+\.[^.]+$/i;

/** Extracts the Canvas-internal numeric user ID from a bulk-downloaded
 * submission filename, or null if the filename doesn't follow that
 * pattern (so the caller can fall back to manual entry for it). */
export function extractCanvasUserId(filename: string): string | null {
  const m = CANVAS_SUBMISSION_FILENAME.exec(filename);
  return m ? m[1] : null;
}
