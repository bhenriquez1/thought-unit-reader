// lib/insights/materializeNarrativeSupport.ts

import type {
  GroundedSupportKind,
  GroundedSupportSelection,
} from "./selectGroundedSupport"
import type { SentenceCandidate } from "./buildSupportNeighborhood"

export type NarrativeSectionKey =
  | "main_signal"
  | "rule"
  | "trap"
  | "grounded_support"

export type NarrativeSection = {
  key: NarrativeSectionKey
  title: string
  lead: string
  support: string[]
  evidenceIds: string[]
  paragraphIds: string[]
}

export type NarrativePageView = {
  sections: NarrativeSection[]
}

type MaterializeNarrativeSupportInput = {
  mainSignal?: GroundedSupportSelection
  rule?: GroundedSupportSelection
  trap?: GroundedSupportSelection
  groundedSupport?: GroundedSupportSelection
  maxSupportPerSection?: number
}

export function materializeNarrativeSupport(
  input: MaterializeNarrativeSupportInput
): NarrativePageView {
  const maxSupportPerSection = input.maxSupportPerSection ?? 3

  const rawSections = [
    toNarrativeSection("main_signal", input.mainSignal, maxSupportPerSection),
    toNarrativeSection("rule", input.rule, maxSupportPerSection),
    toNarrativeSection("trap", input.trap, Math.min(2, maxSupportPerSection)),
    toNarrativeSection(
      "grounded_support",
      input.groundedSupport,
      Math.max(2, maxSupportPerSection)
    ),
  ].filter(Boolean) as NarrativeSection[]

  const deduped = dedupeAcrossSections(rawSections)
  return { sections: deduped }
}

function toNarrativeSection(
  key: NarrativeSectionKey,
  selection: GroundedSupportSelection | undefined,
  maxSupport: number
): NarrativeSection | null {
  if (!selection) return null

  const leadSource = selection.primary ?? selection.anchor
  const lead = sentenceText(leadSource)
  if (!lead) return null

  const support = uniqueSentences(
    selection.supporting
      .map(sentenceText)
      .filter(Boolean)
      .filter((text) => !nearDuplicateText(text, lead))
  ).slice(0, maxSupport)

  const evidenceIds = uniqueStrings([
    leadSource.id,
    ...selection.supporting.map((item) => item.id),
  ])

  const paragraphIds = uniqueStrings([
    leadSource.paragraphId,
    ...selection.supporting.map((item) => item.paragraphId),
  ])

  return {
    key,
    title: titleForSection(key),
    lead: sentenceForSection(key, lead, selection),
    support: support.map((item) => sentenceForSection(key, item, selection, true)),
    evidenceIds,
    paragraphIds,
  }
}

function titleForSection(key: NarrativeSectionKey): string {
  switch (key) {
    case "main_signal":
      return "What this page is about"
    case "rule":
      return "What to do with it"
    case "trap":
      return "Where readers go wrong"
    case "grounded_support":
      return "What on the page supports it"
    default:
      return "Section"
  }
}

function sentenceForSection(
  key: NarrativeSectionKey,
  text: string,
  selection: GroundedSupportSelection,
  isSupport = false
): string {
  const cleaned = normalizeSentence(text)

  if (isSupport) {
    switch (key) {
      case "grounded_support":
        return cleaned
      case "rule":
        return ensureSentencePrefix(cleaned, "This supports the rule because")
      case "trap":
        return ensureSentencePrefix(cleaned, "This signals the trap because")
      case "main_signal":
        return ensureSentencePrefix(cleaned, "This matters because")
      default:
        return cleaned
    }
  }

  switch (key) {
    case "main_signal":
      return cleaned

    case "rule":
      return materializeRuleLead(cleaned, selection)

    case "trap":
      return materializeTrapLead(cleaned, selection)

    case "grounded_support":
      return cleaned

    default:
      return cleaned
  }
}

function materializeRuleLead(
  text: string,
  selection: GroundedSupportSelection
): string {
  const normalized = normalizeSentence(text)

  if (looksActionable(normalized)) {
    return normalized
  }

  const anchor = sentenceText(selection.anchor)
  if (anchor && !nearDuplicateText(anchor, normalized)) {
    return normalizeSentence(
      `Use this as the reading rule: ${lowercaseFirst(normalized)}`
    )
  }

  return normalizeSentence(
    `Use this rule on the page: ${lowercaseFirst(normalized)}`
  )
}

function materializeTrapLead(
  text: string,
  selection: GroundedSupportSelection
): string {
  const normalized = normalizeSentence(text)

  if (looksTrapLike(normalized)) {
    return normalized
  }

  const anchor = sentenceText(selection.anchor)
  if (anchor && !nearDuplicateText(anchor, normalized)) {
    return normalizeSentence(
      `Do not misread the page as if ${lowercaseFirst(normalized)}`
    )
  }

  return normalizeSentence(
    `A common misread is to assume ${stripTerminal(normalized).toLowerCase()}.`
  )
}

function dedupeAcrossSections(sections: NarrativeSection[]): NarrativeSection[] {
  const usedLeadTexts: string[] = []
  const out: NarrativeSection[] = []

  for (const section of sections) {
    if (
      usedLeadTexts.some((existing) => nearDuplicateText(existing, section.lead))
    ) {
      continue
    }

    const filteredSupport = section.support.filter(
      (item) =>
        !nearDuplicateText(item, section.lead) &&
        !usedLeadTexts.some((existing) => nearDuplicateText(existing, item))
    )

    out.push({
      ...section,
      support: uniqueSentences(filteredSupport),
    })

    usedLeadTexts.push(section.lead)
  }

  return out
}

function sentenceText(candidate?: SentenceCandidate): string {
  if (!candidate) return ""
  return normalizeSentence(
    candidate.cleanedText || candidate.normalizedText || candidate.text || ""
  )
}

function normalizeSentence(text: string): string {
  let value = (text || "").replace(/\s+/g, " ").trim()
  if (!value) return ""

  value = value.replace(/^[•\-–—\d.)\s]+/, "").trim()

  if (!/^[A-Z(""'[]/.test(value)) {
    value = uppercaseFirst(value)
  }

  if (!/[.!?]$/.test(value)) {
    value += "."
  }

  return value
}

function uniqueSentences(values: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const key = normalizeForCompare(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }

  return out
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const cleaned = (value || "").trim()
    if (!cleaned || seen.has(cleaned)) continue
    seen.add(cleaned)
    out.push(cleaned)
  }

  return out
}

function nearDuplicateText(a: string, b: string): boolean {
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  if (!na || !nb) return false
  if (na === nb) return true

  const tokensA = tokenSet(na)
  const tokensB = tokenSet(nb)
  if (!tokensA.size || !tokensB.size) return false

  let overlap = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1
  }

  const union = new Set([...tokensA, ...tokensB]).size || 1
  return overlap / union > 0.74
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
    "this",
    "that",
    "these",
    "those",
    "use",
    "rule",
    "common",
    "misread",
    "supports",
    "supports",
  ])

  return new Set(
    text
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => part.length > 2)
      .filter((part) => !stop.has(part))
  )
}

function looksActionable(text: string): boolean {
  return /^(use|check|identify|distinguish|compare|avoid|treat|consider|look|read|remember|apply)\b/i.test(
    text
  ) || /\bshould\b|\bmust\b|\bneed to\b/i.test(text)
}

function looksTrapLike(text: string): boolean {
  return /^(do not|don't|avoid|a common mistake|a common misread|do not confuse)\b/i.test(
    text
  ) || /\btrap\b|\bpitfall\b|\bconfuse\b|\bmistake\b/i.test(text)
}

function ensureSentencePrefix(text: string, prefix: string): string {
  if (!text) return ""
  if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
    return normalizeSentence(text)
  }
  return normalizeSentence(`${prefix} ${lowercaseFirst(stripTerminal(text))}.`)
}

function stripTerminal(text: string): string {
  return text.replace(/[.!?]+$/, "").trim()
}

function uppercaseFirst(text: string): string {
  if (!text) return ""
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function lowercaseFirst(text: string): string {
  if (!text) return ""
  return text.charAt(0).toLowerCase() + text.slice(1)
}
