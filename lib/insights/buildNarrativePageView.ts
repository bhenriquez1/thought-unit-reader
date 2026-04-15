/**
 * buildNarrativePageView.ts
 *
 * Sentence-level post-processing layer above the V3 paragraph pipeline.
 *
 * Takes an already-built PageStoryV3 (where paragraph-level selection and
 * source-block exclusivity are already enforced) and produces a NarrativePageView
 * with four semantically distinct sections:
 *
 *   main_signal    — the page's central claim
 *   rule           — what the reader should do / infer / apply
 *   trap           — where a reader would likely go wrong
 *   grounded_support — nearby sentences that explain / justify / qualify
 *
 * Each section carries a primary sentence + up to N supporting sentences.
 * Cross-section semantic dedupe is applied so Rule ≠ Signal, Trap ≠ Rule,
 * and Support does not merely restate Signal.
 */

import type { PageStoryV3, ParagraphNoteV3, SectionOutput, NarrativePageView } from "./types"
import type { SentenceCandidate } from "./buildSupportNeighborhood"
import { selectGroundedSupport } from "./selectGroundedSupport"
import { passesSectionDedupe } from "./passesSectionDedupe"
import { extractCompleteSentences } from "./textCleanup"

// ---------------------------------------------------------------------------
// Bridge: ParagraphNoteV3[] → SentenceCandidate[][]
// ---------------------------------------------------------------------------

function deriveRoleHints(note: ParagraphNoteV3, sentence: string): SentenceCandidate["roleHints"] {
  return {
    isWarning:    note.kind === "warning"  || /\bavoid\b|trap|mistake|confuse|wrong|pitfall|careful/i.test(sentence),
    isAction:     note.intent === "apply_rule" || /\bshould\b|must\b|apply\b|identify\b|distinguish\b|do not\b/i.test(sentence),
    isContrast:   note.intent === "notice_exception" || /\bwhereas\b|unlike\b|however\b|\bbut\b|in contrast/i.test(sentence),
    isEvidence:   note.intent === "store_support" || /\bbecause\b|therefore\b|this means|thus\b/i.test(sentence),
    isMechanism:  note.intent === "store_support" && /mechanism|pathway|process|causes|drives/i.test(sentence),
    isDefinition: /is defined as|refers to|\bis the\b|\bare the\b/i.test(sentence),
  }
}

function deriveScores(note: ParagraphNoteV3): SentenceCandidate["scores"] {
  const salienceByPriority: Record<string, number> = {
    read_first: 1, read_second: 0.7, warning: 0.75, read_later: 0.4, optional: 0.2,
  }
  return {
    centrality:      note.confidence,
    salience:        salienceByPriority[note.priority] ?? 0.4,
    supportStrength: note.kind === "support" ? 0.8 : note.kind === "important" ? 0.6 : 0.3,
    actionability:   note.intent === "apply_rule" ? 0.9 : 0.3,
    warning:         note.kind === "warning" ? 0.9 : 0.1,
    instructional:   (note.kind === "important" || note.intent === "learn_core") ? 0.8 : 0.4,
  }
}

function notesToSentenceCandidates(notes: ParagraphNoteV3[]): SentenceCandidate[][] {
  // Group notes by paragraphIndex, preserving sorted order
  const byParagraph = new Map<number, ParagraphNoteV3[]>()
  for (const note of notes) {
    const bucket = byParagraph.get(note.paragraphIndex) ?? []
    bucket.push(note)
    byParagraph.set(note.paragraphIndex, bucket)
  }

  const paragraphIndexes = [...byParagraph.keys()].sort((a, b) => a - b)

  return paragraphIndexes.map((pIdx) => {
    const noteGroup = byParagraph.get(pIdx)!
    // Use the highest-priority note in the group for metadata
    const primaryNote = noteGroup.sort((a, b) => b.confidence - a.confidence)[0]

    let sentences = extractCompleteSentences(primaryNote.originalText)

    // If originalText yields no complete sentences, fall back to summarySentence
    if (!sentences.length && primaryNote.summarySentence) {
      sentences = [primaryNote.summarySentence]
    }

    return sentences.map((sentence, sentenceIndex): SentenceCandidate => ({
      id:             `${primaryNote.id}:s${sentenceIndex}`,
      text:           sentence,
      pageNumber:     primaryNote.pageNumber,
      paragraphId:    primaryNote.sourceBlockId,
      sentenceIndex,
      paragraphIndex: pIdx,
      cleanedText:    sentence,
      roleHints:      deriveRoleHints(primaryNote, sentence),
      scores:         deriveScores(primaryNote),
    }))
  })
}

// ---------------------------------------------------------------------------
// Anchor resolution
// ---------------------------------------------------------------------------

/**
 * Find the SentenceCandidate that best represents `blockText` within the
 * sentence-candidate grid. Strategy:
 *   1. exact match by text
 *   2. containment match (blockText contains or is contained in a sentence)
 *   3. first sentence of the paragraph identified by the note's sourceBlockId
 */
function findAnchorCandidate(
  blockText: string,
  notes: ParagraphNoteV3[],
  allParagraphs: SentenceCandidate[][]
): SentenceCandidate | null {
  if (!blockText) return null

  // Find the note whose summarySentence matches blockText
  const matchingNote =
    notes.find((n) => n.summarySentence === blockText) ??
    notes.find((n) =>
      blockText.includes(n.summarySentence) || n.summarySentence.includes(blockText)
    )

  const paragraphIndex = matchingNote?.paragraphIndex

  if (paragraphIndex != null) {
    const paragraph = allParagraphs[paragraphIndex]
    if (paragraph) {
      // Exact sentence text match
      const exact = paragraph.find((c) => c.text === blockText)
      if (exact) return exact

      // Substring containment
      const contained = paragraph.find(
        (c) => blockText.includes(c.text) || c.text.includes(blockText)
      )
      if (contained) return contained

      // Fall back to first sentence in that paragraph
      if (paragraph[0]) return paragraph[0]
    }
  }

  // Last resort: scan all paragraphs
  for (const paragraph of allParagraphs) {
    const exact = paragraph.find((c) => c.text === blockText)
    if (exact) return exact
  }

  return null
}

// ---------------------------------------------------------------------------
// Section builder helpers
// ---------------------------------------------------------------------------

function buildSection(
  kind: "main_signal" | "rule" | "trap" | "grounded_support",
  blockText: string | null | undefined,
  notes: ParagraphNoteV3[],
  allParagraphs: SentenceCandidate[][],
  selected: SectionOutput[],
  maxSupporting: number
): SectionOutput | undefined {
  if (!blockText) return undefined

  const anchor = findAnchorCandidate(blockText, notes, allParagraphs)
  if (!anchor) return undefined

  if (!passesSectionDedupe(anchor, kind, selected).allow) return undefined

  const supportResult = selectGroundedSupport({
    kind: kind === "grounded_support" ? "support" : kind,
    anchor,
    paragraphs: allParagraphs,
    maxSupporting,
  })

  // Filter each support sentence through cross-section dedupe
  const cleanSupport = supportResult.supporting.filter(
    (c) => c.id !== anchor.id && passesSectionDedupe(c, kind, selected).allow
  )

  return {
    section: kind,
    primary: anchor,
    support: cleanSupport,
    rejected: supportResult.rejected,
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Produce a NarrativePageView from an already-built PageStoryV3.
 *
 * The V3 story provides paragraph-level block selection (which paragraph);
 * this layer handles sentence-level selection (which sentence within that
 * paragraph) and cross-section semantic deduplication.
 */
export function buildNarrativePageView(
  storyV3: PageStoryV3 | null | undefined
): NarrativePageView | null {
  if (!storyV3) return null

  const notes = storyV3.paragraphNotes
  if (!notes.length) return null

  const pageNumber = storyV3.pageNumber
  const allParagraphs = notesToSentenceCandidates(notes)

  if (!allParagraphs.length || !allParagraphs.some((p) => p.length > 0)) {
    return { pageNumber, noOutputReason: "no_sentences_extracted" }
  }

  const selected: SectionOutput[] = []

  // ── Main Signal ────────────────────────────────────────────────────────────
  let mainSignal = buildSection(
    "main_signal",
    storyV3.signalBlock?.text,
    notes, allParagraphs, selected, 3
  )

  // Fallback: first important note's summarySentence
  if (!mainSignal) {
    const importantNote = notes.find((n) => n.kind === "important") ?? notes[0]
    if (importantNote) {
      const anchor = findAnchorCandidate(importantNote.summarySentence, notes, allParagraphs)
        ?? allParagraphs[importantNote.paragraphIndex]?.[0]
      if (anchor) {
        mainSignal = { section: "main_signal", primary: anchor, support: [], rejected: [] }
      }
    }
  }

  if (mainSignal) selected.push(mainSignal)

  // ── Rule ───────────────────────────────────────────────────────────────────
  let rule = buildSection(
    "rule",
    storyV3.ruleBlock?.text,
    notes, allParagraphs, selected, 2
  )

  // Fallback: first apply_rule note not already used
  if (!rule) {
    const ruleNote = notes.find(
      (n) =>
        (n.intent === "apply_rule" || n.kind === "support") &&
        !selected.some((s) => s.primary?.paragraphId === n.sourceBlockId)
    )
    if (ruleNote) {
      const candidates = allParagraphs[ruleNote.paragraphIndex] ?? []
      const anchor =
        candidates.find((c) => c.roleHints?.isAction) ??
        candidates[0]
      if (anchor && passesSectionDedupe(anchor, "rule", selected).allow) {
        rule = { section: "rule", primary: anchor, support: [], rejected: [] }
      }
    }
  }

  if (rule) selected.push(rule)

  // ── Trap ───────────────────────────────────────────────────────────────────
  let trap = buildSection(
    "trap",
    storyV3.trapBlock?.text,
    notes, allParagraphs, selected, 1
  )

  // Fallback: first warning note not already used
  if (!trap) {
    const warningNote = notes.find(
      (n) =>
        n.kind === "warning" &&
        !selected.some((s) => s.primary?.paragraphId === n.sourceBlockId)
    )
    if (warningNote) {
      const candidates = allParagraphs[warningNote.paragraphIndex] ?? []
      const anchor =
        candidates.find((c) => c.roleHints?.isWarning || c.roleHints?.isContrast) ??
        candidates[0]
      if (anchor && passesSectionDedupe(anchor, "trap", selected).allow) {
        trap = { section: "trap", primary: anchor, support: [], rejected: [] }
      }
    }
  }

  if (trap) selected.push(trap)

  // ── Grounded Support ───────────────────────────────────────────────────────
  // Pull from the main signal's neighborhood; exclude already-used sentences.
  let groundedSupport: SectionOutput | undefined

  if (mainSignal?.primary) {
    const supportResult = selectGroundedSupport({
      kind: "support",
      anchor: mainSignal.primary,
      paragraphs: allParagraphs,
      maxSupporting: 4,
    })
    const cleanSupport = supportResult.supporting.filter(
      (c) =>
        c.id !== mainSignal?.primary?.id &&
        passesSectionDedupe(c, "grounded_support", selected).allow
    )
    if (cleanSupport.length > 0) {
      groundedSupport = {
        section: "grounded_support",
        support: cleanSupport,
        rejected: supportResult.rejected,
      }
    }
  }

  // Fallback: collect from paragraphs not claimed by any section
  if (!groundedSupport) {
    const usedParagraphIds = new Set(
      selected.map((s) => s.primary?.paragraphId).filter(Boolean)
    )
    const unusedCandidates = allParagraphs
      .flat()
      .filter(
        (c) =>
          !usedParagraphIds.has(c.paragraphId) &&
          passesSectionDedupe(c, "grounded_support", selected).allow
      )
      .slice(0, 4)
    if (unusedCandidates.length > 0) {
      groundedSupport = {
        section: "grounded_support",
        support: unusedCandidates,
        rejected: [],
      }
    }
  }

  // Fail closed if no output at all
  if (!mainSignal && !rule && !trap && !groundedSupport) {
    return { pageNumber, noOutputReason: "all_sections_empty" }
  }

  return {
    pageNumber,
    mainSignal,
    rule,
    trap,
    groundedSupport,
  }
}
