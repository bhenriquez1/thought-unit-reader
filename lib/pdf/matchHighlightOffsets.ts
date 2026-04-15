// lib/pdf/matchHighlightOffsets.ts

import type { TextSpanRect } from "./buildTextSpanRects"

export type HighlightMatch = {
  startOffset?: number
  endOffset?: number
  rectIds: string[]
  confidence: number
}

type MatchHighlightOffsetsArgs = {
  highlightText: string
  pageRects: TextSpanRect[]
}

export function matchHighlightOffsets({
  highlightText,
  pageRects,
}: MatchHighlightOffsetsArgs): HighlightMatch {
  const normalizedTarget = normalizeForMatch(highlightText)
  if (!normalizedTarget) {
    return { rectIds: [], confidence: 0 }
  }

  const fullPageText = buildPageText(pageRects)
  const exactIndex = fullPageText.normalized.indexOf(normalizedTarget)

  if (exactIndex >= 0) {
    const startOffset = fullPageText.offsetMap[exactIndex]
    const endNormalizedIndex = exactIndex + normalizedTarget.length - 1
    const endOffset = fullPageText.offsetMap[Math.min(endNormalizedIndex, fullPageText.offsetMap.length - 1)] + 1

    const rectIds = pageRects
      .filter((rect) => overlaps(startOffset, endOffset, rect.startOffset, rect.endOffset))
      .map((rect) => rect.id)

    return {
      startOffset,
      endOffset,
      rectIds,
      confidence: 0.95,
    }
  }

  return fuzzyMatch(normalizedTarget, pageRects)
}

function buildPageText(pageRects: TextSpanRect[]): {
  normalized: string
  offsetMap: number[]
} {
  let normalized = ""
  const offsetMap: number[] = []

  for (const rect of pageRects) {
    const text = normalizeForMatch(rect.text)
    if (!text) continue

    for (let i = 0; i < text.length; i += 1) {
      normalized += text[i]
      offsetMap.push(rect.startOffset + Math.min(i, rect.endOffset - rect.startOffset - 1))
    }

    normalized += " "
    offsetMap.push(rect.endOffset)
  }

  return { normalized: normalized.trim(), offsetMap }
}

function fuzzyMatch(
  normalizedTarget: string,
  rects: TextSpanRect[]
): HighlightMatch {
  let best:
    | {
        rectIds: string[]
        confidence: number
        startOffset?: number
        endOffset?: number
      }
    | undefined

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i; j < Math.min(rects.length, i + 5); j += 1) {
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
