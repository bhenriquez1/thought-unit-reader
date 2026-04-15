// lib/insights/selectGroundedSupport.ts

import { buildSupportNeighborhood, type NeighborhoodBundle, type SentenceCandidate } from "./buildSupportNeighborhood"

export type GroundedSupportKind =
  | "main_signal"
  | "rule"
  | "trap"
  | "mechanism"
  | "effect"
  | "contrast"
  | "support"

export type GroundedSupportSelection = {
  kind: GroundedSupportKind
  anchor: SentenceCandidate
  primary?: SentenceCandidate
  supporting: SentenceCandidate[]
  rejected: Array<{
    candidate: SentenceCandidate
    reason:
      | "same_as_anchor"
      | "duplicate"
      | "too_weak"
      | "wrong_role"
      | "too_fragmentary"
      | "low_grounding"
      | "over_budget"
  }>
}

export type SelectGroundedSupportInput = {
  kind: GroundedSupportKind
  anchor: SentenceCandidate
  paragraphs: SentenceCandidate[][]
  maxSupporting?: number
  includeAdjacentParagraphs?: boolean
}

export function selectGroundedSupport(
  input: SelectGroundedSupportInput
): GroundedSupportSelection {
  const {
    kind,
    anchor,
    paragraphs,
    maxSupporting = defaultBudgetForKind(kind),
    includeAdjacentParagraphs = true,
  } = input

  const neighborhood = buildSupportNeighborhood(anchor, paragraphs)

  const rejected: GroundedSupportSelection["rejected"] = []

  const localCandidates = neighborhood.sameParagraph.map((candidate) => ({
    candidate,
    source: "same" as const,
    score: scoreCandidateForKind(kind, anchor, candidate, "same"),
  }))

  const adjacentCandidates = includeAdjacentParagraphs
    ? [
        ...(neighborhood.prevParagraph ?? []).map((candidate) => ({
          candidate,
          source: "adjacent" as const,
          score: scoreCandidateForKind(kind, anchor, candidate, "adjacent"),
        })),
        ...(neighborhood.nextParagraph ?? []).map((candidate) => ({
          candidate,
          source: "adjacent" as const,
          score: scoreCandidateForKind(kind, anchor, candidate, "adjacent"),
        })),
      ]
    : []

  const pooled = [...localCandidates, ...adjacentCandidates]
    .filter(({ candidate }) => {
      if (candidate.id === anchor.id) {
        rejected.push({ candidate, reason: "same_as_anchor" })
        return false
      }
      if (!isSupportRenderable(candidate)) {
        rejected.push({ candidate, reason: "too_fragmentary" })
        return false
      }
      return true
    })
    .sort((a, b) => b.score - a.score)

  const deduped: typeof pooled = []
  const seen = new Set<string>()

  for (const item of pooled) {
    const sig = dedupeSignature(item.candidate)
    if (!sig) {
      rejected.push({ candidate: item.candidate, reason: "duplicate" })
      continue
    }
    if (seen.has(sig)) {
      rejected.push({ candidate: item.candidate, reason: "duplicate" })
      continue
    }
    seen.add(sig)
    deduped.push(item)
  }

  const threshold = minScoreForKind(kind)

  const viable = deduped.filter((item) => {
    if (item.score < threshold) {
      rejected.push({ candidate: item.candidate, reason: "too_weak" })
      return false
    }
    if (!matchesKind(kind, anchor, item.candidate)) {
      rejected.push({ candidate: item.candidate, reason: "wrong_role" })
      return false
    }
    return true
  })

  const selected: SentenceCandidate[] = []
  let primary: SentenceCandidate | undefined

  for (const item of viable) {
    if (!primary) {
      primary = item.candidate
      continue
    }

    if (selected.length >= maxSupporting) {
      rejected.push({ candidate: item.candidate, reason: "over_budget" })
      continue
    }

    if (!isGroundedToAnchor(anchor, item.candidate)) {
      rejected.push({ candidate: item.candidate, reason: "low_grounding" })
      continue
    }

    if (createsRepetition(anchor, primary, selected, item.candidate)) {
      rejected.push({ candidate: item.candidate, reason: "duplicate" })
      continue
    }

    selected.push(item.candidate)
  }

  return {
    kind,
    anchor,
    primary,
    supporting: selected,
    rejected,
  }
}

export function selectGroundedSupportFromNeighborhood(args: {
  kind: GroundedSupportKind
  anchor: SentenceCandidate
  neighborhood: NeighborhoodBundle
  maxSupporting?: number
}): GroundedSupportSelection {
  const paragraphs: SentenceCandidate[][] = [
    ...(args.neighborhood.prevParagraph ? [args.neighborhood.prevParagraph] : []),
    [args.anchor, ...args.neighborhood.sameParagraph].sort(
      (a, b) => (a.sentenceIndex ?? 0) - (b.sentenceIndex ?? 0)
    ),
    ...(args.neighborhood.nextParagraph ? [args.neighborhood.nextParagraph] : []),
  ]

  return selectGroundedSupport({
    kind: args.kind,
    anchor: args.anchor,
    paragraphs,
    maxSupporting: args.maxSupporting,
    includeAdjacentParagraphs: true,
  })
}

function defaultBudgetForKind(kind: GroundedSupportKind): number {
  switch (kind) {
    case "main_signal":
      return 3
    case "rule":
      return 3
    case "trap":
      return 2
    case "mechanism":
      return 3
    case "effect":
      return 2
    case "contrast":
      return 2
    default:
      return 2
  }
}

function minScoreForKind(kind: GroundedSupportKind): number {
  switch (kind) {
    case "main_signal":
      return 0.34
    case "rule":
      return 0.36
    case "trap":
      return 0.3
    case "mechanism":
      return 0.33
    case "effect":
      return 0.3
    case "contrast":
      return 0.28
    default:
      return 0.26
  }
}

function scoreCandidateForKind(
  kind: GroundedSupportKind,
  anchor: SentenceCandidate,
  candidate: SentenceCandidate,
  source: "same" | "adjacent"
): number {
  const lexical = lexicalSupport(anchor, candidate)
  const roleFit = roleFitForKind(kind, anchor, candidate)
  const signalScore = candidate.scores?.supportStrength ?? 0
  const centrality = candidate.scores?.centrality ?? 0
  const instructional = candidate.scores?.instructional ?? 0
  const warning = candidate.scores?.warning ?? 0
  const sourceBoost = source === "same" ? 0.12 : 0.02
  const sentenceBoost = sentenceShapeBoost(candidate)

  let score =
    lexical * 0.34 +
    roleFit * 0.3 +
    signalScore * 0.14 +
    centrality * 0.1 +
    instructional * 0.07 +
    sentenceBoost * 0.05 +
    sourceBoost

  if (kind === "trap") score += warning * 0.18
  if (kind === "effect") score += effectBoost(candidate) * 0.18
  if (kind === "mechanism") score += mechanismBoost(candidate) * 0.18
  if (kind === "contrast") score += contrastBoost(candidate) * 0.2

  return clamp(score, 0, 1.5)
}

function matchesKind(
  kind: GroundedSupportKind,
  _anchor: SentenceCandidate,
  candidate: SentenceCandidate
): boolean {
  const hints = candidate.roleHints ?? {}
  const text = content(candidate)

  switch (kind) {
    case "trap":
      return (
        hints.isWarning === true ||
        hints.isContrast === true ||
        /avoid|mistake|trap|wrong|confus|pitfall|however|but/.test(text)
      )

    case "rule":
      return (
        hints.isAction === true ||
        hints.isDefinition === true ||
        /should|must|use|apply|when|then|therefore/.test(text)
      )

    case "mechanism":
      return (
        hints.isMechanism === true ||
        hints.isCause === true ||
        /because|drives|causes|mediates|through|by /.test(text)
      )

    case "effect":
      return (
        hints.isEffect === true ||
        /therefore|results in|leads to|causes|so that|thus|will /.test(text)
      )

    case "contrast":
      return (
        hints.isContrast === true ||
        /whereas|unlike|differs|in contrast|versus|vs\.|rather than/.test(text)
      )

    case "main_signal":
      return lexicalSupport(_anchor, candidate) > 0.08 || roleFitForKind(kind, _anchor, candidate) > 0.24

    default:
      return true
  }
}

function isGroundedToAnchor(anchor: SentenceCandidate, candidate: SentenceCandidate): boolean {
  const overlap = lexicalSupport(anchor, candidate)
  const sameParagraph = anchor.paragraphId && candidate.paragraphId === anchor.paragraphId
  const sameNeighborhoodBand =
    Math.abs((anchor.paragraphIndex ?? 0) - (candidate.paragraphIndex ?? 0)) <= 1

  return overlap > 0.06 || Boolean(sameParagraph) || sameNeighborhoodBand
}

function createsRepetition(
  anchor: SentenceCandidate,
  primary: SentenceCandidate | undefined,
  selected: SentenceCandidate[],
  candidate: SentenceCandidate
): boolean {
  const against = [anchor, primary, ...selected].filter(Boolean) as SentenceCandidate[]
  return against.some((existing) => nearDuplicate(existing, candidate))
}

function roleFitForKind(
  kind: GroundedSupportKind,
  _anchor: SentenceCandidate,
  candidate: SentenceCandidate
): number {
  const c = candidate.roleHints ?? {}
  let score = 0

  switch (kind) {
    case "main_signal":
      if (c.isEvidence) score += 0.22
      if (c.isExample) score += 0.14
      if (c.isSummaryLike) score -= 0.06
      if (c.isEvidence) score += 0.12
      break

    case "rule":
      if (c.isAction) score += 0.28
      if (c.isDefinition) score += 0.18
      if (c.isEvidence) score += 0.12
      break

    case "trap":
      if (c.isWarning) score += 0.34
      if (c.isContrast) score += 0.2
      if (c.isEffect) score += 0.08
      break

    case "mechanism":
      if (c.isMechanism) score += 0.3
      if (c.isCause) score += 0.22
      if (c.isEffect) score += 0.1
      break

    case "effect":
      if (c.isEffect) score += 0.34
      if (c.isCause) score += 0.12
      if (c.isEvidence) score += 0.08
      break

    case "contrast":
      if (c.isContrast) score += 0.34
      if (c.isWarning) score += 0.12
      break

    default:
      if (c.isEvidence) score += 0.14
      if (c.isExample) score += 0.1
  }

  return clamp(score, 0, 1)
}

function lexicalSupport(a: SentenceCandidate, b: SentenceCandidate): number {
  const tokensA = tokenSet(content(a))
  const tokensB = tokenSet(content(b))
  if (!tokensA.size || !tokensB.size) return 0

  let overlap = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1
  }

  const union = new Set([...tokensA, ...tokensB]).size || 1
  return overlap / union
}

function tokenSet(text: string): Set<string> {
  const stop = new Set([
    "the",
    "and",
    "for",
    "that",
    "this",
    "with",
    "from",
    "into",
    "they",
    "them",
    "have",
    "will",
    "would",
    "should",
    "could",
    "there",
    "their",
    "then",
    "than",
    "because",
    "which",
    "where",
    "when",
    "what",
    "your",
    "each",
    "page",
    "indicates",
    "sentence",
    "step",
  ])

  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => part.length > 2)
      .filter((part) => !stop.has(part))
  )
}

function effectBoost(candidate: SentenceCandidate): number {
  const text = content(candidate)
  if (/results in|leads to|causes|therefore|thus|so that|produces/.test(text)) return 1
  return candidate.roleHints?.isEffect ? 0.8 : 0
}

function mechanismBoost(candidate: SentenceCandidate): number {
  const text = content(candidate)
  if (/because|through|via|by |mediates|drives|underlies/.test(text)) return 1
  return candidate.roleHints?.isMechanism || candidate.roleHints?.isCause ? 0.8 : 0
}

function contrastBoost(candidate: SentenceCandidate): number {
  const text = content(candidate)
  if (/whereas|unlike|rather than|in contrast|differs|versus|vs/.test(text)) return 1
  return candidate.roleHints?.isContrast ? 0.8 : 0
}

function sentenceShapeBoost(candidate: SentenceCandidate): number {
  const text = content(candidate)
  const length = text.length

  if (length < 24) return 0
  if (length <= 180 && /[.!?]$/.test(text)) return 1
  if (length <= 260) return 0.7
  return 0.4
}

function isSupportRenderable(candidate: SentenceCandidate): boolean {
  const text = content(candidate)
  if (!text) return false
  if (text.length < 18) return false
  if (text.includes("...")) return false
  if (!/[.!?]$/.test(text) && text.length < 48) return false
  return true
}

function nearDuplicate(a: SentenceCandidate, b: SentenceCandidate): boolean {
  const sa = dedupeSignature(a)
  const sb = dedupeSignature(b)
  if (!sa || !sb) return false
  if (sa === sb) return true

  const overlap = lexicalSupport(a, b)
  return overlap > 0.78
}

function dedupeSignature(candidate: SentenceCandidate): string {
  return content(candidate)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function content(candidate: SentenceCandidate): string {
  return (candidate.cleanedText || candidate.normalizedText || candidate.text || "").trim()
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}
