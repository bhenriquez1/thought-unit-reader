// lib/pdf/buildTextSpanRects.ts

export type RawTextItem = {
  str: string
  transform?: number[]
  width?: number
  height?: number
  fontName?: string
}

export type TextSpanRect = {
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
}

type BuildTextSpanRectsArgs = {
  pageNumber: number
  textItems: RawTextItem[]
  viewportScale?: number
}

export function buildTextSpanRects({
  pageNumber,
  textItems,
  viewportScale = 1,
}: BuildTextSpanRectsArgs): TextSpanRect[] {
  const rects: TextSpanRect[] = []
  let runningOffset = 0

  const normalizedItems = textItems
    .map((item, index) => normalizeTextItem(item, index, viewportScale))
    .filter((item): item is NormalizedItem => Boolean(item))

  for (let i = 0; i < normalizedItems.length; i += 1) {
    const item = normalizedItems[i]
    const prev = normalizedItems[i - 1]

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
      normalizedText: normalizeForMatch(item.text),
      startOffset,
      endOffset,
      left: item.left,
      top: item.top,
      width: item.width,
      height: item.height,
    })

    runningOffset = endOffset
  }

  return mergeAdjacentRects(rects)
}

type NormalizedItem = {
  id: string
  text: string
  left: number
  top: number
  width: number
  height: number
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

function mergeAdjacentRects(rects: TextSpanRect[]): TextSpanRect[] {
  if (!rects.length) return rects

  const merged: TextSpanRect[] = []
  let current = { ...rects[0] }

  for (let i = 1; i < rects.length; i += 1) {
    const next = rects[i]

    if (canMergeRects(current, next)) {
      current = {
        ...current,
        text: `${current.text} ${next.text}`.replace(/\s+/g, " ").trim(),
        normalizedText: normalizeForMatch(`${current.normalizedText} ${next.normalizedText}`),
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

function canMergeRects(a: TextSpanRect, b: TextSpanRect): boolean {
  const sameLine = Math.abs(a.top - b.top) <= Math.max(a.height, b.height) * 0.35
  const closeHorizontally = Math.abs(b.left - (a.left + a.width)) <= Math.max(8, a.height * 0.6)
  const shortTokens =
    a.text.split(/\s+/).length <= 2 &&
    b.text.split(/\s+/).length <= 2

  return sameLine && closeHorizontally && shortTokens
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
