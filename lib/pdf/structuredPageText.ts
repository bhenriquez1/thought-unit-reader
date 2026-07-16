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
//
// Two-column detection: if items cluster into two horizontal bands with a gap of
// COLUMN_GAP_MIN_PTS or more between them, each column is processed independently
// (left column fully before right column). This prevents row-interleaved text on
// multi-column pages, which caused sentence jumps and PDF word-rect misses.

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

// Column detection thresholds.
// The horizontal X-start range of all items on a single-column page is typically
// narrow (<150 PDF units). A two-column page spans both columns, so xSpan is much
// larger. A gap of COLUMN_GAP_MIN_PTS between consecutive sorted X-starts in the
// middle of the page signals a column gutter.
const COLUMN_MIN_X_SPAN = 150;
const COLUMN_GAP_MIN_PTS = 40;

/**
 * Detects a two-column layout by looking for a large horizontal gap in item
 * X-start positions. Returns the midpoint of the gap (the column boundary) or
 * null if the page appears to be single-column.
 */
function detectColumnSplit(items: PdfTextItem[]): number | null {
  if (items.length < 10) return null;

  const xs = items.map(it => it.transform?.[4] ?? 0).sort((a, b) => a - b);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const xSpan = xMax - xMin;
  if (xSpan < COLUMN_MIN_X_SPAN) return null;

  let maxGap = 0;
  let gapMid = -1;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap > maxGap) { maxGap = gap; gapMid = (xs[i] + xs[i - 1]) / 2; }
  }

  if (maxGap < COLUMN_GAP_MIN_PTS) return null;

  // The boundary must fall in the middle 50% of the X span (not at the edges),
  // otherwise it is a margin/indent gap, not a column gutter.
  const relPos = (gapMid - xMin) / xSpan;
  return relPos >= 0.25 && relPos <= 0.75 ? gapMid : null;
}

/**
 * Reconstruct reading-order text from a set of items that all belong to the same
 * column (or the full page when no column split is detected). Sorts items top-to-
 * bottom then left-to-right, groups into lines by Y proximity, and classifies
 * line gaps as wrapped lines vs. paragraph breaks.
 */
function buildColumn(items: PdfTextItem[]): string {
  const sorted = [...items].sort((a, b) => {
    const ay = a.transform?.[5] ?? 0;
    const by = b.transform?.[5] ?? 0;
    const yDiff = by - ay;
    if (Math.abs(yDiff) > Y_TOLERANCE) return yDiff;
    return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
  });

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
  const nonEmpty = lines.filter(l => l.text.length > 0);
  if (nonEmpty.length <= 1) return nonEmpty.map(l => l.text).join(" ").trim();

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

/**
 * Reconstruct a page's text using item geometry to recover line and paragraph
 * structure that a flat `.join(" ")` discards. When a two-column layout is
 * detected, each column is processed independently so the entire left column
 * appears before the right column in the output — matching visual reading order
 * and preventing sentence-order jumps in Current Page speech playback.
 */
export function buildStructuredPageText(items: PdfTextItem[]): string {
  const filtered = items.filter(it => typeof it.str === "string" && it.str.trim().length > 0);
  if (filtered.length === 0) return "";

  const columnSplit = detectColumnSplit(filtered);
  if (columnSplit !== null) {
    // Two-column layout: process each column independently then concatenate.
    // Full-width items (chapter headings, captions) typically start near the
    // left margin and fall into the "left" group, appearing first — correct.
    const left  = filtered.filter(it => (it.transform?.[4] ?? 0) <  columnSplit);
    const right = filtered.filter(it => (it.transform?.[4] ?? 0) >= columnSplit);
    const leftText  = buildColumn(left).trim();
    const rightText = buildColumn(right).trim();
    return [leftText, rightText].filter(Boolean).join("\n\n").replace(/[ \t]+/g, " ").trim();
  }

  return buildColumn(filtered).replace(/[ \t]+/g, " ").trim();
}
