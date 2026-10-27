def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    """Splits text into overlapping chunks, packing whole LINES rather than
    words. Line breaks are structural, not incidental — spreadsheet/table
    extraction (text_extraction._extract_xlsx_text) emits one row per line
    and a "[Sheet: X]" marker per sheet; a word-based chunker that rejoins
    with spaces (the previous approach) silently flattens every row and
    sheet boundary into one unreadable run-on line. Packing by line instead
    keeps each row on its own line, and a chunk straddling two sheets is
    still at least legible row-by-row rather than mashed together.
    A single line longer than chunk_size is hard-truncated rather than
    split mid-line, so a sentence/row is never cut at an arbitrary offset."""
    lines = [line for line in text.split("\n") if line.strip()]
    if not lines:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(lines):
        chunk_lines: list[str] = []
        length = 0
        end = start
        while end < len(lines) and length + len(lines[end]) + 1 <= chunk_size:
            chunk_lines.append(lines[end])
            length += len(lines[end]) + 1
            end += 1
        if not chunk_lines:
            chunk_lines = [lines[start][:chunk_size]]
            end = start + 1
        chunks.append("\n".join(chunk_lines))

        if end >= len(lines):
            break

        overlap_lines = 0
        overlap_len = 0
        back = end - 1
        while back > start and overlap_len < overlap:
            overlap_len += len(lines[back]) + 1
            overlap_lines += 1
            back -= 1
        start = max(end - overlap_lines, start + 1)

    return chunks
