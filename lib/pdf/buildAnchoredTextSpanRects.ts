// lib/pdf/buildAnchoredTextSpanRects.ts

import type { SemanticPage, SemanticSentence, SemanticParagraph } from "@/lib/pdf/buildSemanticPage"
import type { RawTextItem } from "@/lib/pdf/buildTextSpanRects"

export type AnchoredTextSpanRect = {
  id: string
  pageNumber: number
  text: string
  normalizedText: string

  startOffset: number
  endOffset: number

  left: number
  top: number
  width: number
  height: number

  paragraphId?: string
  sentenceId?: string
  sentenceStartOffset?: number
  sentenceEndOffset?: number

  rectIndex: number
}

type BuildAnchoredTextSpanRectsArgs = {
  pageNumber: number
  textItems: RawTextItem[]
  semanticPage: SemanticPage | null
  viewportScale?: number
}

type NormalizedItem = {
  id: string
  text: string
  normalizedText: string
  left: number
  top: number
  width: number
  height: number
}

export function buildAnchoredTextSpanRects({
  pageNumber,
  textItems,
  semanticPage,
  viewportScale = 1,
}: BuildAnchoredTextSpanRectsArgs): AnchoredTextSpanRect[] {
  const normalizedItems = textItems
    .map((item, index) => normalizeTextItem(item, index, viewportScale))
    .filter((item): item is NormalizedItem => Boolean(item))

  if (!normalizedItems.length) return []

  const baseRects = buildBaseRects(pageNumber, normalizedItems)
  if (!semanticPage) return baseRects

  return attachSemanticAnchors(baseRects, semanticPage)
}

function buildBaseRects(
  pageNumber: number,
  items: NormalizedItem[]
): AnchoredTextSpanRect[] {
  const rects: AnchoredTextSpanRect[] = []
  let runningOffset = 0

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    const prev = items[i - 1]

    const needsLeadingSpace = shouldInsertSpace(prev, item)
    if (needsLeadingSpace) {
      runningOffset += 1
    }

    const startOffset = runningOffset
    const endOffset = startOffset + item.text.length

    rects.push({
      id: item.id,
      pageNumber,
      text: item.text,
      normalizedText: item.normalizedText,
      startOffset,
      endOffset,
      left: item.left,
      top: item.top,
      width: item.width,
      height: item.height,
      rectIndex: i,
    })

    runningOffset = endOffset
  }

  return mergeShortAdjacentRects(rects)
}

function attachSemanticAnchors(
  rects: AnchoredTextSpanRect[],
  semanticPage: SemanticPage
): AnchoredTextSpanRect[] {
  const sortedSentences = buildSentenceAnchorIndex(semanticPage.sentences)
  const paragraphMap = buildParagraphAnchorIndex(semanticPage.paragraphs)

  return rects.map((rect) => {
    const sentence = findBestSentenceAnchor(rect, sortedSentences)
    const paragraph =
      sentence
        ? paragraphMap.get(sentence.paragraphId)
        : findBestParagraphAnchor(rect, semanticPage.paragraphs)

    return {
      ...rect,
      sentenceId: sentence?.id,
      paragraphId: sentence?.paragraphId ?? paragraph?.id,
      sentenceStartOffset: sentence?.startOffset,
      sentenceEndOffset: sentence?.endOffset,
    }
  })
}

function buildSentenceAnchorIndex(
  sentences: SemanticSentence[]
): SemanticSentence[] {
  return [...sentences].sort((a, b) => a.startOffset - b.startOffset)
}

function buildParagraphAnchorIndex(
  paragraphs: SemanticParagraph[]
): Map<string, SemanticParagraph> {
  const map = new Map<string, SemanticParagraph>()
  for (const paragraph of paragraphs) {
    map.set(paragraph.id, paragraph)
  }
  return map
}

function findBestSentenceAnchor(
  rect: AnchoredTextSpanRect,
  sentences: SemanticSentence[]
): SemanticSentence | undefined {
  let best: { sentence: SemanticSentence; score: number } | undefined

  for (const sentence of sentences) {
    const overlapScore = offsetOverlapScore(
      rect.startOffset,
      rect.endOffset,
      sentence.startOffset,
      sentence.endOffset
    )
    const lexicalScore = normalizedSimilarity(
      rect.normalizedText,
      normalizeForMatch(sentence.text)
    )
    const score = overlapScore * 0.75 + lexicalScore * 0.25

    if (!best || score > best.score) {
      best = { sentence, score }
    }
  }

  if (!best || best.score < 0.18) return undefined
  return best.sentence
}

function findBestParagraphAnchor(
  rect: AnchoredTextSpanRect,
  paragraphs: SemanticParagraph[]
): SemanticParagraph | undefined {
  let best: { paragraph: SemanticParagraph; score: number } | undefined

  for (const paragraph of paragraphs) {
    const lexicalScore = normalizedSimilarity(
      rect.normalizedText,
      normalizeForMatch(paragraph.text)
    )
    if (!best || lexicalScore > best.score) {
      best = { paragraph, score: lexicalScore }
    }
  }

  if (!best || best.score < 0.12) return undefined
  return best.paragraph
}

function normalizeTextItem(
  item: RawTextItem,
  index: number,
  viewportScale: number
): NormalizedItem | null {
  const text = (item.str || "")
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!text) return null

  const t = item.transform || [1, 0, 0, 1, 0, 0]
  const left = (t[4] || 0) * viewportScale
  const top = (t[5] || 0) * viewportScale
  const width = (item.width || estimateWidth(text)) * viewportScale
  const height = (item.height || estimateHeight(t)) * viewportScale

  return {
    id: `text-span-${index}`,
    text,
    normalizedText: normalizeForMatch(text),
    left,
    top,
    width,
    height,
  }
}

function shouldInsertSpace(
  prev: NormalizedItem | undefined,
  next: NormalizedItem
): boolean {
  if (!prev) return false

  if (isLineBreak(prev, next)) return true

  const prevRight = prev.left + prev.width
  const horizontalGap = next.left - prevRight

  if (horizontalGap > Math.max(2, prev.height * 0.12)) return true

  if (/[([{'""]$/.test(prev.text)) return false
  if (/^[,.;:!?)}\]'"]/.test(next.text)) return false

  return false
}

function isLineBreak(prev: NormalizedItem, next: NormalizedItem): boolean {
  const verticalDelta = Math.abs(next.top - prev.top)
  return verticalDelta > Math.max(prev.height, next.height) * 0.6
}

function mergeShortAdjacentRects(
  rects: AnchoredTextSpanRect[]
): AnchoredTextSpanRect[] {
  if (!rects.length) return rects

  const merged: AnchoredTextSpanRect[] = []
  let current = { ...rects[0] }

  for (let i = 1; i < rects.length; i += 1) {
    const next = rects[i]

    if (canMergeRects(current, next)) {
      current = {
        ...current,
        text: `${current.text} ${next.text}`.replace(/\s+/g, " ").trim(),
        normalizedText: normalizeForMatch(`${current.text} ${next.text}`),
        endOffset: next.endOffset,
        width: Math.max(current.left + current.width, next.left + next.width) - current.left,
        height: Math.max(current.height, next.height),
      }
      continue
    }

    merged.push(current)
    current = { ...next }
  }

  merged.push(current)
  return merged
}

function canMergeRects(
  a: AnchoredTextSpanRect,
  b: AnchoredTextSpanRect
): boolean {
  const sameLine = Math.abs(a.top - b.top) <= Math.max(a.height, b.height) * 0.35
  const closeHorizontally =
    Math.abs(b.left - (a.left + a.width)) <= Math.max(8, a.height * 0.6)
  const shortTokens =
    a.text.split(/\s+/).length <= 2 && b.text.split(/\s+/).length <= 2

  return sameLine && closeHorizontally && shortTokens
}

function offsetOverlapScore(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): number {
  const overlapStart = Math.max(aStart, bStart)
  const overlapEnd = Math.min(aEnd, bEnd)
  const overlap = Math.max(0, overlapEnd - overlapStart)
  const base = Math.max(aEnd - aStart, bEnd - bStart, 1)
  return overlap / base
}

function normalizedSimilarity(a: string, b: string): number {
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

function estimateWidth(text: string): number {
  return Math.max(8, text.length * 6.5)
}

function estimateHeight(transform: number[]): number {
  return Math.abs(transform[3] || 12)
}
