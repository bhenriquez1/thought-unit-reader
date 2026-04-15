// lib/insights/buildSupportNeighborhood.ts

export type SentenceCandidate = {
  id: string
  text: string
  pageNumber: number
  paragraphId: string
  sentenceIndex: number
  paragraphIndex: number

  cleanedText?: string
  normalizedText?: string

  roleHints?: {
    isDefinition?: boolean
    isMechanism?: boolean
    isCause?: boolean
    isEffect?: boolean
    isContrast?: boolean
    isWarning?: boolean
    isAction?: boolean
    isExample?: boolean
    isEvidence?: boolean
    isSummaryLike?: boolean
  }

  scores?: {
    salience?: number
    instructional?: number
    actionability?: number
    warning?: number
    supportStrength?: number
    centrality?: number
  }
}

export type NeighborhoodBundle = {
  anchor: SentenceCandidate
  sameParagraph: SentenceCandidate[]
  prevParagraph?: SentenceCandidate[]
  nextParagraph?: SentenceCandidate[]
}

/**
 * Build a support neighborhood around a selected anchor sentence.
 *
 * Purpose:
 * - keep support extraction grounded in local page context
 * - prefer same-paragraph explanation first
 * - allow bounded spillover into adjacent paragraphs when semantically related
 *
 * Assumptions:
 * - `paragraphs` is ordered by paragraphIndex
 * - each paragraph is an ordered array of SentenceCandidate
 * - all candidates belong to the current page only
 */
export function buildSupportNeighborhood(
  anchor: SentenceCandidate,
  paragraphs: SentenceCandidate[][]
): NeighborhoodBundle {
  const empty: NeighborhoodBundle = {
    anchor,
    sameParagraph: [],
  }

  if (!anchor || !Array.isArray(paragraphs) || paragraphs.length === 0) {
    return empty
  }

  const paragraphIndex = resolveParagraphIndex(anchor, paragraphs)
  if (paragraphIndex === -1) {
    return empty
  }

  const sameParagraphRaw = paragraphs[paragraphIndex] ?? []
  const prevParagraphRaw = paragraphIndex > 0 ? paragraphs[paragraphIndex - 1] ?? [] : undefined
  const nextParagraphRaw =
    paragraphIndex < paragraphs.length - 1 ? paragraphs[paragraphIndex + 1] ?? [] : undefined

  const sameParagraph = sameParagraphRaw
    .filter((candidate) => candidate.id !== anchor.id)
    .filter(isRenderableNeighborhoodCandidate)
    .sort((a, b) => {
      const distanceA = Math.abs((a.sentenceIndex ?? 0) - (anchor.sentenceIndex ?? 0))
      const distanceB = Math.abs((b.sentenceIndex ?? 0) - (anchor.sentenceIndex ?? 0))
      return distanceA - distanceB
    })

  const prevParagraph = rankAdjacentParagraph(anchor, prevParagraphRaw).slice(0, 2)
  const nextParagraph = rankAdjacentParagraph(anchor, nextParagraphRaw).slice(0, 2)

  const bundle: NeighborhoodBundle = {
    anchor,
    sameParagraph,
    prevParagraph: prevParagraph.length ? prevParagraph : undefined,
    nextParagraph: nextParagraph.length ? nextParagraph : undefined,
  }

  return bundle
}

function resolveParagraphIndex(
  anchor: SentenceCandidate,
  paragraphs: SentenceCandidate[][]
): number {
  if (Number.isInteger(anchor.paragraphIndex) && anchor.paragraphIndex >= 0) {
    const byIndex = paragraphs[anchor.paragraphIndex]
    if (Array.isArray(byIndex) && byIndex.some((candidate) => candidate.id === anchor.id)) {
      return anchor.paragraphIndex
    }
  }

  for (let i = 0; i < paragraphs.length; i += 1) {
    if ((paragraphs[i] ?? []).some((candidate) => candidate.id === anchor.id)) {
      return i
    }
  }

  if (anchor.paragraphId) {
    for (let i = 0; i < paragraphs.length; i += 1) {
      if ((paragraphs[i] ?? []).some((candidate) => candidate.paragraphId === anchor.paragraphId)) {
        return i
      }
    }
  }

  return -1
}

function rankAdjacentParagraph(
  anchor: SentenceCandidate,
  candidates?: SentenceCandidate[]
): SentenceCandidate[] {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return []
  }

  return candidates
    .filter(isRenderableNeighborhoodCandidate)
    .map((candidate) => ({
      candidate,
      score: adjacentSupportScore(anchor, candidate),
    }))
    .filter((item) => item.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.candidate)
}

function adjacentSupportScore(anchor: SentenceCandidate, candidate: SentenceCandidate): number {
  const lexical = lexicalSimilarity(anchor, candidate)
  const role = roleCompatibility(anchor, candidate)
  const scoreBoost = numericScoreBoost(candidate)
  const lengthBoost = sentenceLengthBoost(candidate)

  return lexical * 0.55 + role * 0.25 + scoreBoost * 0.12 + lengthBoost * 0.08
}

function lexicalSimilarity(a: SentenceCandidate, b: SentenceCandidate): number {
  const tokensA = tokenize(normalizeText(a.cleanedText || a.normalizedText || a.text))
  const tokensB = tokenize(normalizeText(b.cleanedText || b.normalizedText || b.text))

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0
  }

  let overlap = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1
  }

  const union = new Set([...tokensA, ...tokensB]).size || 1
  return overlap / union
}

function roleCompatibility(a: SentenceCandidate, b: SentenceCandidate): number {
  const ah = a.roleHints ?? {}
  const bh = b.roleHints ?? {}

  let score = 0

  if (ah.isMechanism && (bh.isCause || bh.isEffect || bh.isEvidence)) score += 0.35
  if (ah.isDefinition && (bh.isEvidence || bh.isExample)) score += 0.25
  if (ah.isAction && (bh.isEvidence || bh.isWarning)) score += 0.2
  if (ah.isContrast && bh.isContrast) score += 0.2
  if (bh.isSummaryLike) score -= 0.1
  if (bh.isExample) score += 0.1
  if (bh.isEvidence) score += 0.15
  if (bh.isCause || bh.isEffect) score += 0.1

  return clamp(score, 0, 1)
}

function numericScoreBoost(candidate: SentenceCandidate): number {
  const scores = candidate.scores ?? {}
  const salience = scores.salience ?? 0
  const supportStrength = scores.supportStrength ?? 0
  const centrality = scores.centrality ?? 0
  const instructional = scores.instructional ?? 0

  return clamp(
    salience * 0.3 + supportStrength * 0.35 + centrality * 0.2 + instructional * 0.15,
    0,
    1
  )
}

function sentenceLengthBoost(candidate: SentenceCandidate): number {
  const text = (candidate.cleanedText || candidate.normalizedText || candidate.text || "").trim()
  const len = text.length

  if (len < 25) return 0
  if (len < 55) return 0.35
  if (len < 180) return 1
  if (len < 260) return 0.75
  return 0.45
}

function isRenderableNeighborhoodCandidate(candidate: SentenceCandidate): boolean {
  const text = (candidate.cleanedText || candidate.normalizedText || candidate.text || "").trim()
  if (!text) return false
  if (text.length < 18) return false
  if (looksLikeFragment(text)) return false
  if (looksLikeBoilerplate(text)) return false
  return true
}

function looksLikeFragment(text: string): boolean {
  if (text.includes("...")) return true
  if (/^[a-z0-9]/.test(text)) return true
  if (/[,:;–-]$/.test(text)) return true
  if (!/[.!?]$/.test(text) && text.length < 40) return true
  return false
}

function looksLikeBoilerplate(text: string): boolean {
  const lower = text.toLowerCase()

  const blockedPatterns = [
    "all rights reserved",
    "isbn",
    "permissions",
    "copyright",
    "publisher",
    "printed in",
    "edition",
    "www.",
    "http://",
    "https://",
  ]

  return blockedPatterns.some((pattern) => lower.includes(pattern))
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(text: string): Set<string> {
  const stopwords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "if",
    "then",
    "this",
    "that",
    "these",
    "those",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "by",
    "as",
    "at",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "it",
    "its",
    "from",
    "into",
    "than",
    "may",
    "can",
    "will",
    "would",
    "should",
    "could",
  ])

  const tokens = text
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length > 2)
    .filter((token) => !stopwords.has(token))

  return new Set(tokens)
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}
