// lib/pdf/matchAnchoredHighlightRects.ts

import type { AnchoredTextSpanRect } from "./buildAnchoredTextSpanRects"

export type AnchoredHighlightMatch = {
  rectIds: string[]
  startOffset?: number
  endOffset?: number
  confidence: number
}

type HighlightLike = {
  text: string
  paragraphId?: string
  sentenceId?: string
  startOffset?: number
  endOffset?: number
}

type MatchAnchoredHighlightRectsArgs = {
  highlight: HighlightLike
  pageRects: AnchoredTextSpanRect[]
}

export function matchAnchoredHighlightRects({
  highlight,
  pageRects,
}: MatchAnchoredHighlightRectsArgs): AnchoredHighlightMatch {
  if (!pageRects.length) {
    return { rectIds: [], confidence: 0 }
  }

  // 1. Strongest path: sentence id
  if (highlight.sentenceId) {
    const bySentence = pageRects.filter((rect) => rect.sentenceId === highlight.sentenceId)
    if (bySentence.length) {
      return buildMatchFromRects(bySentence, 0.98)
    }
  }

  // 2. Next strongest path: paragraph id
  if (highlight.paragraphId) {
    const byParagraph = pageRects.filter((rect) => rect.paragraphId === highlight.paragraphId)
    if (byParagraph.length) {
      return buildMatchFromRects(byParagraph, 0.88)
    }
  }

  // 3. Next strongest path: explicit offsets
  if (
    typeof highlight.startOffset === "number" &&
    typeof highlight.endOffset === "number"
  ) {
    const byOffsets = pageRects.filter((rect) =>
      overlaps(
        highlight.startOffset as number,
        highlight.endOffset as number,
        rect.startOffset,
        rect.endOffset
      )
    )
    if (byOffsets.length) {
      return buildMatchFromRects(byOffsets, 0.84)
    }
  }

  // 4. Fallback: text similarity
  return fuzzyRectMatch(highlight.text, pageRects)
}

function buildMatchFromRects(
  rects: AnchoredTextSpanRect[],
  confidence: number
): AnchoredHighlightMatch {
  const sorted = [...rects].sort((a, b) => a.startOffset - b.startOffset)

  return {
    rectIds: sorted.map((rect) => rect.id),
    startOffset: sorted[0]?.startOffset,
    endOffset: sorted[sorted.length - 1]?.endOffset,
    confidence,
  }
}

function fuzzyRectMatch(
  text: string,
  rects: AnchoredTextSpanRect[]
): AnchoredHighlightMatch {
  const normalizedTarget = normalizeForMatch(text)
  if (!normalizedTarget) return { rectIds: [], confidence: 0 }

  let best:
    | {
        rectIds: string[]
        confidence: number
        startOffset?: number
        endOffset?: number
      }
    | undefined

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i; j < Math.min(rects.length, i + 6); j += 1) {
      const window = rects.slice(i, j + 1)
      const joined = normalizeForMatch(window.map((r) => r.text).join(" "))
      const sim = similarity(normalizedTarget, joined)

      if (!best || sim > best.confidence) {
        best = {
          rectIds: window.map((r) => r.id),
          confidence: sim,
          startOffset: window[0].startOffset,
          endOffset: window[window.length - 1].endOffset,
        }
      }
    }
  }

  if (!best || best.confidence < 0.58) {
    return { rectIds: [], confidence: 0 }
  }

  return best
}

function similarity(a: string, b: string): number {
  const aSet = new Set(a.split(" ").filter(Boolean))
  const bSet = new Set(b.split(" ").filter(Boolean))

  if (!aSet.size || !bSet.size) return 0

  let overlap = 0
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1
  }

  const union = new Set([...aSet, ...bSet]).size || 1
  return overlap / union
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd
}
