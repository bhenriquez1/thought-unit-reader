import type { SentenceCandidate } from "./buildSupportNeighborhood"
import { buildSupportNeighborhood } from "./buildSupportNeighborhood"
import {
  selectGroundedSupport,
  type GroundedSupportSelection,
} from "./selectGroundedSupport"
import {
  materializeNarrativeSupport,
  type NarrativePageView,
} from "./materializeNarrativeSupport"

export type NarrativeBuildInput = {
  candidates: SentenceCandidate[]
  pageNumber?: number
  pageTitle?: string
  maxSupportPerSection?: number
}

export type NarrativeBuildResult = {
  pageNumber?: number
  pageTitle?: string
  mainSignal?: GroundedSupportSelection
  rule?: GroundedSupportSelection
  trap?: GroundedSupportSelection
  groundedSupport?: GroundedSupportSelection
  narrative: NarrativePageView
  rejected: {
    rule: SentenceCandidate[]
    trap: SentenceCandidate[]
    support: SentenceCandidate[]
  }
}

export function buildNarrativePageView(
  input: NarrativeBuildInput
): NarrativeBuildResult {
  const paragraphMatrix = buildParagraphMatrix(input.candidates)

  const mainSignalAnchor = selectMainSignalAnchor(input.candidates)
  if (!mainSignalAnchor) {
    return {
      pageNumber: input.pageNumber,
      pageTitle: input.pageTitle,
      narrative: { sections: [] },
      rejected: {
        rule: [],
        trap: [],
        support: [],
      },
    }
  }

  const mainSignal = selectGroundedSupport({
    kind: "main_signal",
    anchor: mainSignalAnchor,
    paragraphs: paragraphMatrix,
    maxSupporting: 3,
    includeAdjacentParagraphs: true,
  })

  const ruleAnchor = selectRuleAnchor({
    candidates: input.candidates,
    mainSignalAnchor,
  })

  const rule = ruleAnchor
    ? selectGroundedSupport({
        kind: "rule",
        anchor: ruleAnchor,
        paragraphs: paragraphMatrix,
        maxSupporting: 2,
        includeAdjacentParagraphs: true,
      })
    : undefined

  const trapAnchor = selectTrapAnchor({
    candidates: input.candidates,
    mainSignalAnchor,
    ruleAnchor,
  })

  const trap = trapAnchor
    ? selectGroundedSupport({
        kind: "trap",
        anchor: trapAnchor,
        paragraphs: paragraphMatrix,
        maxSupporting: 2,
        includeAdjacentParagraphs: true,
      })
    : undefined

  const groundedSupport = selectGroundedSupport({
    kind: "support",
    anchor: mainSignalAnchor,
    paragraphs: paragraphMatrix,
    maxSupporting: 4,
    includeAdjacentParagraphs: true,
  })

  const narrative = materializeNarrativeSupport({
    mainSignal,
    rule,
    trap,
    groundedSupport,
    maxSupportPerSection: input.maxSupportPerSection ?? 3,
  })

  return {
    pageNumber: input.pageNumber,
    pageTitle: input.pageTitle,
    mainSignal,
    rule,
    trap,
    groundedSupport,
    narrative,
    rejected: {
      rule: collectRejectedCandidates(rule),
      trap: collectRejectedCandidates(trap),
      support: collectRejectedCandidates(groundedSupport),
    },
  }
}

function buildParagraphMatrix(
  candidates: SentenceCandidate[]
): SentenceCandidate[][] {
  const grouped = new Map<number, SentenceCandidate[]>()

  for (const candidate of candidates) {
    const idx = candidate.paragraphIndex ?? 0
    if (!grouped.has(idx)) grouped.set(idx, [])
    grouped.get(idx)!.push(candidate)
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, items]) =>
      [...items].sort(
        (a, b) => (a.sentenceIndex ?? 0) - (b.sentenceIndex ?? 0)
      )
    )
}

function selectMainSignalAnchor(
  candidates: SentenceCandidate[]
): SentenceCandidate | undefined {
  const ranked = [...candidates]
    .filter(isRenderableAnchor)
    .sort((a, b) => scoreMainSignal(b) - scoreMainSignal(a))

  return ranked[0]
}

function selectRuleAnchor(args: {
  candidates: SentenceCandidate[]
  mainSignalAnchor: SentenceCandidate
}): SentenceCandidate | undefined {
  const ranked = [...args.candidates]
    .filter((candidate) => candidate.id !== args.mainSignalAnchor.id)
    .filter(isRenderableAnchor)
    .filter((candidate) => !nearDuplicateCandidate(candidate, args.mainSignalAnchor))
    .sort((a, b) => scoreRuleAnchor(b, args.mainSignalAnchor) - scoreRuleAnchor(a, args.mainSignalAnchor))

  return ranked[0]
}

function selectTrapAnchor(args: {
  candidates: SentenceCandidate[]
  mainSignalAnchor: SentenceCandidate
  ruleAnchor?: SentenceCandidate
}): SentenceCandidate | undefined {
  const ranked = [...args.candidates]
    .filter((candidate) => candidate.id !== args.mainSignalAnchor.id)
    .filter((candidate) => candidate.id !== args.ruleAnchor?.id)
    .filter(isRenderableAnchor)
    .filter((candidate) => !nearDuplicateCandidate(candidate, args.mainSignalAnchor))
    .filter((candidate) => !args.ruleAnchor || !nearDuplicateCandidate(candidate, args.ruleAnchor))
    .sort(
      (a, b) =>
        scoreTrapAnchor(b, args.mainSignalAnchor, args.ruleAnchor) -
        scoreTrapAnchor(a, args.mainSignalAnchor, args.ruleAnchor)
    )

  return ranked[0]
}

function scoreMainSignal(candidate: SentenceCandidate): number {
  const scores = candidate.scores ?? {}
  const hints = candidate.roleHints ?? {}
  const text = candidateText(candidate)

  let score = 0
  score += (scores.centrality ?? 0) * 0.3
  score += (scores.salience ?? 0) * 0.25
  score += (scores.instructional ?? 0) * 0.15
  score += (scores.supportStrength ?? 0) * 0.1

  if (hints.isSummaryLike) score += 0.2
  if (hints.isDefinition) score += 0.08
  if (hints.isMechanism) score += 0.05
  if (candidate.sentenceIndex === 0) score += 0.08
  if (candidate.paragraphIndex === 0) score += 0.06
  if (text.length > 55 && text.length < 220) score += 0.08
  if (looksBoilerplate(text)) score -= 1

  return score
}

function scoreRuleAnchor(
  candidate: SentenceCandidate,
  mainSignal: SentenceCandidate
): number {
  const scores = candidate.scores ?? {}
  const hints = candidate.roleHints ?? {}
  const text = candidateText(candidate)

  let score = 0
  score += (scores.actionability ?? 0) * 0.35
  score += (scores.instructional ?? 0) * 0.25
  score += (scores.centrality ?? 0) * 0.12
  score += lexicalOverlap(candidate, mainSignal) * 0.12

  if (hints.isAction) score += 0.2
  if (/\bshould\b|\bmust\b|\bneed to\b|\buse\b|\bidentify\b|\bapply\b|\bremember\b/i.test(text)) {
    score += 0.22
  }
  if (hints.isWarning) score -= 0.08
  if (looksBoilerplate(text)) score -= 1

  return score
}

function scoreTrapAnchor(
  candidate: SentenceCandidate,
  mainSignal: SentenceCandidate,
  ruleAnchor?: SentenceCandidate
): number {
  const scores = candidate.scores ?? {}
  const hints = candidate.roleHints ?? {}
  const text = candidateText(candidate)

  let score = 0
  score += (scores.warning ?? 0) * 0.35
  score += (scores.salience ?? 0) * 0.1
  score += lexicalOverlap(candidate, mainSignal) * 0.12

  if (hints.isWarning) score += 0.24
  if (hints.isContrast) score += 0.18
  if (/\bhowever\b|\bbut\b|\bavoid\b|\btrap\b|\bmistake\b|\bwrong\b|\bconfuse\b|\bpitfall\b/i.test(text)) {
    score += 0.28
  }

  if (ruleAnchor) {
    score += lexicalOverlap(candidate, ruleAnchor) * 0.08
  }

  if (looksBoilerplate(text)) score -= 1

  return score
}

function collectRejectedCandidates(
  selection?: GroundedSupportSelection
): SentenceCandidate[] {
  if (!selection) return []
  return selection.rejected.map((item) => item.candidate)
}

function isRenderableAnchor(candidate: SentenceCandidate): boolean {
  const text = candidateText(candidate)
  if (!text) return false
  if (text.length < 24) return false
  if (text.includes("...")) return false
  if (looksBoilerplate(text)) return false
  return true
}

function candidateText(candidate: SentenceCandidate): string {
  return (
    candidate.cleanedText ||
    candidate.normalizedText ||
    candidate.text ||
    ""
  ).trim()
}

function looksBoilerplate(text: string): boolean {
  return /(copyright|all rights reserved|isbn|publisher|edition|permissions|printed in|library of congress)/i.test(
    text
  )
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
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
    "section",
    "reader",
  ])

  return new Set(
    normalizeForCompare(text)
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => part.length > 2)
      .filter((part) => !stop.has(part))
  )
}

function lexicalOverlap(a: SentenceCandidate, b: SentenceCandidate): number {
  const tokensA = tokenSet(candidateText(a))
  const tokensB = tokenSet(candidateText(b))
  if (!tokensA.size || !tokensB.size) return 0

  let overlap = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1
  }

  const union = new Set([...tokensA, ...tokensB]).size || 1
  return overlap / union
}

function nearDuplicateCandidate(
  a: SentenceCandidate,
  b: SentenceCandidate
): boolean {
  const na = normalizeForCompare(candidateText(a))
  const nb = normalizeForCompare(candidateText(b))
  if (!na || !nb) return false
  if (na === nb) return true
  return lexicalOverlap(a, b) > 0.78
}
