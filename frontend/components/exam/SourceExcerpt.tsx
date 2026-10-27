import { cn } from "@/lib/cn";

interface TableBlock {
  type: "table";
  caption: string | null;
  rows: string[][];
}

interface TextBlock {
  type: "text";
  content: string;
}

type Block = TableBlock | TextBlock;

const NUMERIC_RE = /^-?[\d,.]+%?$/;

function isHeaderLike(cells: string[]): boolean {
  const numericCount = cells.filter((c) => NUMERIC_RE.test(c.trim())).length;
  return numericCount <= cells.length / 2;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wraps any substring of `content` that matches one of `terms` in a <mark>.
 * Terms come from the examiner LLM (see backend prompts.py) and are the
 * exact value(s) a given question is actually about — e.g. one coefficient
 * out of a whole regression table — so the student can spot it immediately
 * instead of scanning the entire excerpt. */
function highlightText(content: string, terms: string[] | undefined, keyPrefix: string) {
  if (!terms || terms.length === 0) return content;
  const pattern = terms.map(escapeRegExp).filter(Boolean).join("|");
  if (!pattern) return content;
  const parts = content.split(new RegExp(`(${pattern})`, "g"));
  if (parts.length === 1) return content;
  return parts.map((part, i) =>
    terms.includes(part) ? (
      <mark
        key={`${keyPrefix}-${i}`}
        className="rounded px-0.5 font-semibold bg-yellow-300 text-zinc-900"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/** Spreadsheet-extracted excerpts come through as "[Sheet: X]" markers plus
 * one pipe-delimited row per line (see backend text_extraction.py +
 * chunking.py). Rendered as plain text this is a wall of "A | B | C" —
 * genuinely hard to parse at a glance. Parse it into real tables instead,
 * falling back to plain paragraph text for non-tabular (PDF/docx) excerpts.
 * A chunk can start mid-table (no header row) since chunk boundaries don't
 * align to table boundaries — so a row is only styled as a header when it
 * looks header-like (mostly non-numeric cells), never assumed from position. */
function parseBlocks(text: string): Block[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const pipeLineCount = lines.filter((l) => l.includes("|")).length;
  if (pipeLineCount < Math.max(2, lines.length * 0.4)) {
    return [{ type: "text", content: text }];
  }

  const blocks: Block[] = [];
  let current: TableBlock | null = null;
  let textBuffer: string[] = [];

  function flushText() {
    if (textBuffer.length > 0) {
      blocks.push({ type: "text", content: textBuffer.join(" ") });
      textBuffer = [];
    }
  }

  for (const line of lines) {
    const sheetMatch = line.match(/^\[Sheet:\s*(.+?)\]$/i);
    if (sheetMatch) {
      flushText();
      current = { type: "table", caption: sheetMatch[1], rows: [] };
      blocks.push(current);
      continue;
    }
    if (line.includes("|")) {
      if (!current) {
        current = { type: "table", caption: null, rows: [] };
        blocks.push(current);
      }
      current.rows.push(line.split("|").map((c) => c.trim()));
    } else {
      current = null;
      textBuffer.push(line);
    }
  }
  flushText();
  return blocks;
}

export function SourceExcerpt({
  text,
  dark = false,
  highlightTerms,
}: {
  text: string;
  dark?: boolean;
  highlightTerms?: string[] | null;
}) {
  const blocks = parseBlocks(text);
  // The LLM is told to copy terms verbatim from the excerpt, and a whole
  // table row there reads like "Intercept | -33300" — if it copies the row
  // as one term, that string never matches any individual <td> once the row
  // is split into cells for rendering, so nothing would highlight. Split any
  // pipe-joined term back into its individual values here.
  const terms = highlightTerms?.length
    ? highlightTerms.flatMap((t) => (t.includes("|") ? t.split("|").map((p) => p.trim()) : t)).filter(Boolean)
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) =>
        block.type === "text" ? (
          <p
            key={i}
            className={cn("whitespace-pre-line text-sm leading-relaxed", dark ? "text-zinc-400" : "text-zinc-600")}
          >
            {highlightText(block.content, terms, `t${i}`)}
          </p>
        ) : (
          <div key={i} className="overflow-x-auto">
            {block.caption && (
              <p
                className={cn(
                  "mb-1 text-xs font-semibold uppercase tracking-wide",
                  dark ? "text-zinc-500" : "text-zinc-500"
                )}
              >
                {block.caption}
              </p>
            )}
            <table className="w-full border-collapse text-xs">
              <tbody>
                {block.rows.map((cells, r) => {
                  const headerLike = isHeaderLike(cells);
                  const rowMatches = terms?.some((t) => cells.some((c) => c.includes(t))) ?? false;
                  return (
                    <tr
                      key={r}
                      className={cn(
                        "border-b",
                        dark ? "border-zinc-800" : "border-zinc-200",
                        headerLike && (dark ? "bg-zinc-800/60" : "bg-zinc-50"),
                        rowMatches && (dark ? "bg-yellow-400/10" : "bg-yellow-50")
                      )}
                    >
                      {cells.map((cell, c) => (
                        <td
                          key={c}
                          className={cn(
                            "whitespace-nowrap px-2 py-1 tabular-nums",
                            headerLike
                              ? cn("font-semibold", dark ? "text-zinc-300" : "text-zinc-700")
                              : dark
                                ? "text-zinc-400"
                                : "text-zinc-600"
                          )}
                        >
                          {highlightText(cell, terms, `r${r}c${c}`)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
