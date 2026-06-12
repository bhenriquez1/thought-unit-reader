// lib/pdf/structuredPageText.ts
// Geometry-based page text reconstruction — shared by SmartPDFViewer (live grounding/
// synthesis input) and pdfjs-handler (whole-book diagnostics).
//
// Problem: pdf.js's getTextContent() returns text "items" whose chunking depends on
// how the source PDF's content stream happens to emit text runs — some PDFs emit
// per-paragraph runs, others per-line, others nearly per-word. A flat `.join(" ")`
// of item.str values discards the one signal that is consistent across every PDF:
// each item's position on the page (item.transform[4]/[5] = x/y).
//
// This reconstructs lines from y-proximity, then classifies the gap between
// consecutive lines as either a line-wrap within the same paragraph (joined with a
// space, with hyphenation merged) or a paragraph/section break (rendered as "\n\n"),
// based on the gap relative to the page's typical single-line spacing.

export type PdfTextItem = {
  str?: string;
  transform?: number[];
};

// Items within this many PDF-space units of vertical position are treated as the
// same visual line (matches the tolerance already used for sort-order grouping).
const Y_TOLERANCE = 3;

// A line gap larger than this multiple of the page's median line gap is treated as
// a paragraph/section break rather than a wrapped line within the same paragraph.
const PARAGRAPH_GAP_MULTIPLIER = 1.4;

/**
 * Reconstruct a page's text using item geometry to recover line and paragraph
 * structure that a flat `.join(" ")` discards. Runs the same regardless of whether
 * the source PDF emits text per-word, per-line, or per-paragraph — boundaries are
 * derived from geometry, not from how the PDF happens to chunk its text runs.
 */
export function buildStructuredPageText(items: PdfTextItem[]): string {
  const filtered = items.filter((it) => typeof it.str === "string" && it.str.trim().length > 0);
  if (filtered.length === 0) return "";

  // Sort top-to-bottom (desc Y in PDF space), then left-to-right (asc X) within a row.
  const sorted = [...filtered].sort((a, b) => {
    const ay = a.transform?.[5] ?? 0;
    const by = b.transform?.[5] ?? 0;
    const yDiff = by - ay;
    if (Math.abs(yDiff) > Y_TOLERANCE) return yDiff;
    return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
  });

  // Group into lines by Y proximity.
  const lines: { y: number; text: string }[] = [];
  for (const item of sorted) {
    const y = item.transform?.[5] ?? 0;
    const str = item.str ?? "";
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - y) <= Y_TOLERANCE) {
      last.text += (last.text.endsWith(" ") || str.startsWith(" ") ? "" : " ") + str;
    } else {
      lines.push({ y, text: str });
    }
  }

  for (const line of lines) line.text = line.text.replace(/\s+/g, " ").trim();
  const nonEmpty = lines.filter((l) => l.text.length > 0);
  if (nonEmpty.length <= 1) return nonEmpty.map((l) => l.text).join(" ").trim();

  // Median gap between consecutive line baselines ≈ single-line spacing on this page.
  const gaps: number[] = [];
  for (let i = 1; i < nonEmpty.length; i++) gaps.push(Math.abs(nonEmpty[i - 1].y - nonEmpty[i].y));
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] || 0;

  let out = nonEmpty[0].text;
  for (let i = 1; i < nonEmpty.length; i++) {
    const gap = gaps[i - 1];
    const prevText = nonEmpty[i - 1].text;
    const nextText = nonEmpty[i].text;

    if (medianGap > 0 && gap > medianGap * PARAGRAPH_GAP_MULTIPLIER) {
      out += "\n\n" + nextText;
      continue;
    }

    // Merge hyphenated words split across a line wrap: "...exam-" + "ple" -> "...example"
    if (/[A-Za-z]-$/.test(prevText) && /^[a-z]/.test(nextText)) {
      out = out.slice(0, -1) + nextText;
      continue;
    }

    out += " " + nextText;
  }

  return out.replace(/[ \t]+/g, " ").trim();
}
