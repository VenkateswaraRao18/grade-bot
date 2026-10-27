/** Kept in sync with backend/app/services/text_extraction.py's
 * SUPPORTED_CONTENT_TYPES — stats coursework isn't just PDFs/text, so
 * spreadsheets and Word docs are accepted too. */
export const UPLOAD_ACCEPT =
  "application/pdf,text/plain,text/csv,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx";

export const UPLOAD_HINT = "PDF, Word, Excel, CSV, or .txt";
