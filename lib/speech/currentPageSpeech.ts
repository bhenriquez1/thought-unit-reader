// Current Page speech is a strict source-reading path. It may normalize
// whitespace so extracted PDF lines can be sent to TTS, and it strips page
// furniture (running headers/footers, page numbers, copyright/publisher
// debris, checkpoint/callout section labels) before segmenting — but it
// must not add, reorder, summarize, or paraphrase any surviving lexical
// content, and must never drop instructional content (body prose,
// equations, figure/table captions) just because it's adjacent to furniture.

import { cleanActivePageText, classifyLineRole, type RegionRole } from "@/lib/insights/cleanActivePageText";
import { buildSourceWordDiagnostic, type SourceWordDiagnostic } from "@/lib/speech/sourceWordDiagnostic";

const ABBREVIATION_RE = /\b(Fig|No|vol|pp|cf|e\.g|i\.e|vs|Dr|Mr|Mrs|Ms|Prof|et\s+al|etc|approx|dept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|St|Avg|avg|max|min)\.\s*$/i;

// P0 stabilization, Tier 3 — roles that stay semantic context (headings orient
// the listener, page furniture is never meaningful) but are normally not
// spoken. "body" and "figure-table-caption" are read aloud — a figure/table
// caption can carry real instructional content (see hasSubstantiveCaptionContent
// below for the "bare label, no content" exception). classifyLineRole() is the
// existing lib/insights/cleanActivePageText.ts classifier (already used by the
// Canonical Page Map) — reused here rather than building a second one.
const NON_SPOKEN_ROLES: ReadonlySet<RegionRole> = new Set(["heading", "page-furniture", "checkpoint-review", "callout-label"]);

// A caption line that survived cleanActivePageText's FIGURE_CAPTION_RE match
// but carries no real description beyond the "Figure N." / "Table N." label
// itself — e.g. "Figure 3.2." with nothing after the number. Speaking a bare
// label with no content aloud tells the listener nothing; a caption with a
// real description ("Figure 3.2 The ATP synthase enzyme rotates during
// phosphorylation...") is real instructional content and stays spoken.
const BARE_CAPTION_LABEL_RE =
  /^(?:Figure|FIGURE|Fig\.|Table|TABLE|Photo|PHOTO|Illustration|ILLUSTRATION)\s+\d+[.\-]?\d*\s*[.]?\s*$/;

function hasSubstantiveCaptionContent(line: string): boolean {
  return !BARE_CAPTION_LABEL_RE.test(line.trim());
}

export function normalizeSourceWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitOversizedSegment(segment: string, maxChars: number): string[] {
  if (segment.length <= maxChars) return [segment];

  const parts: string[] = [];
  let remaining = segment;
  while (remaining.length > maxChars) {
    const boundary = remaining.lastIndexOf(" ", maxChars);
    // A single source token must never be modified merely to satisfy a
    // provider limit. Keep it intact and let the provider report its limit.
    if (boundary <= 0) return [...parts, remaining];
    parts.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary + 1);
  }
  if (remaining) parts.push(remaining);
  return parts;
}

/**
 * Builds ordered TTS segments for the whole current page.
 *
 * Invariant: every returned segment is verbatim source text — cleanActivePageText's
 * output, re-segmented into sentences, never invented/paraphrased/reordered.
 * What changed (P0 stabilization, Tier 3): NOT every surviving line is spoken
 * anymore. Section headings, page-furniture fragments that survived the regex
 * stripping above, and (rare, since cleanActivePageText already strips these)
 * residual checkpoint/callout markers are classified via classifyLineRole()
 * and excluded from narration — they remain real page content (a caller that
 * wants full-page semantic context, not just narration, still has cleanActivePageText's
 * output available), just not read aloud as if they were body prose. A figure/
 * table caption is kept UNLESS it's a bare "Figure 3.2." label with no actual
 * description — see hasSubstantiveCaptionContent above.
 *
 * Classification runs on cleanActivePageText's PARAGRAPH-BREAK-preserving
 * output (before normalizeSourceWhitespace collapses newlines to spaces) —
 * classifying after collapsing would risk a heading with no terminal
 * punctuation ("2.1 Limits of Sequences") getting glued by the sentence-
 * boundary splitter to the body sentence that follows it, so the whole
 * merged blob would be misclassified as one unit and either wrongly kept
 * (heading prefix spoken) or wrongly dropped (the real body sentence lost
 * with it). Splitting on paragraph breaks first — the same structural
 * boundary lib/pdf/structuredPageText.ts already inserts between headings
 * and body paragraphs — keeps each classification decision scoped to one
 * real structural unit.
 *
 * The page furniture stripped here (running headers/footers, page numbers,
 * copyright/publisher debris, checkpoint/callout section labels — see
 * lib/insights/cleanActivePageText.ts) is the same stripping already used
 * for anchor grounding and synthesis input; this reuses it rather than
 * building a second matcher.
 */
// The instructional reading sequence AND the queued sentence segments,
// computed once so buildCurrentPageSpeechSegments (unchanged public
// behavior — still just string[], every existing caller untouched) and
// buildCurrentPageSpeechDiagnostic (the correction's own
// sourceWordsExpected/Queued/Skipped assertion) share one source of truth
// instead of the diagnostic re-deriving the filtering logic and risking
// drift from what actually got queued.
function buildCurrentPageSpeechResult(
  activePageText: string,
  maxChars: number,
): { source: string; sentences: string[] } {
  const cleaned = cleanActivePageText(activePageText, "current-page-speech", { stripFigureCaptions: false });
  if (!cleaned) return { source: "", sentences: [] };

  const lines = cleaned.split(/\n+/).map(normalizeSourceWhitespace).filter(Boolean);
  const spokenLines = lines.filter((line) => {
    const role = classifyLineRole(line);
    if (NON_SPOKEN_ROLES.has(role)) return false;
    if (role === "figure-table-caption") return hasSubstantiveCaptionContent(line);
    return true;
  });
  const source = normalizeSourceWhitespace(spokenLines.join(" "));
  if (!source) return { source: "", sentences: [] };

  const chunks = source.split(/(?<=[.!?…])\s+/);
  const sentences: string[] = [];

  for (const chunk of chunks) {
    if (!chunk) continue;
    const previous = sentences[sentences.length - 1];
    const looksLikeContinuation = /^[a-z"'(0-9]/.test(chunk);
    if (previous && (ABBREVIATION_RE.test(previous) || looksLikeContinuation)) {
      sentences[sentences.length - 1] = `${previous} ${chunk}`;
    } else {
      sentences.push(chunk);
    }
  }

  return { source, sentences: sentences.flatMap((sentence) => splitOversizedSegment(sentence, maxChars)) };
}

export function buildCurrentPageSpeechSegments(
  activePageText: string,
  maxChars = 3500,
): string[] {
  return buildCurrentPageSpeechResult(activePageText, maxChars).sentences;
}

/**
 * Correction (Current Mode losslessness) — the diagnostic assertion
 * requested alongside buildCurrentPageSpeechSegments: sourceWordsExpected
 * (words in the selected instructional reading sequence, after legitimate
 * furniture-only stripping), sourceWordsQueued (words actually present
 * across the sentence segments queued for TTS), and sourceWordsSkipped
 * (their difference — must be 0 for a correctly-functioning segmenter; a
 * positive value means real content was lost during segmentation, not
 * during the earlier, deliberate furniture-stripping stage). Reuses
 * buildCurrentPageSpeechResult's own computation rather than re-deriving
 * the filtering logic — the two numbers can never drift apart from what
 * buildCurrentPageSpeechSegments itself actually returns.
 */
export function buildCurrentPageSpeechDiagnostic(
  activePageText: string,
  maxChars = 3500,
): SourceWordDiagnostic {
  const { source, sentences } = buildCurrentPageSpeechResult(activePageText, maxChars);
  return buildSourceWordDiagnostic(source, sentences);
}
