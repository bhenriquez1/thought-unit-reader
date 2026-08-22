// components/reader/StudySpeechPanel.tsx
// Study Speech — reads PageBrain aloud.
// Primary: OpenAI TTS via /api/tts (server-side, key never exposed).
// Fallback: browser speechSynthesis.

"use client";

const DEV = process.env.NODE_ENV === "development";
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CurrentPageStudyModel, VisualAnchor } from "@/lib/insights/currentPageStudyModel";
import {
  buildSpeechScript,
  buildSpeechTimeline,
  formulaToSpeech,
  type StudySpeechMode,
  type SpeechSegment,
} from "@/lib/speech/studySpeechEngine";
import type { ExpertAnchor } from "@/lib/insights/canonicalLeftPanel";
import { normalizeFormulasForSpeech } from "@/lib/speech/formulaNormalization";
import { renderStars } from "@/lib/insights/importanceTiers";
import { buildCurrentPageSpeechSegments } from "@/lib/speech/currentPageSpeech";
import type { SpeechContentRole } from "@/lib/speech/speechContentRole";
import {
  tokenizeWords,
  estimateWordWeights,
  wordIndexForFraction,
  wordIndexForCharIndex,
  scaleIndex,
  type SyncWord,
} from "@/lib/speech/wordSync";
import { useReadingFocusStore, type ReadingCursor } from "@/lib/readingFocus/readingFocusStore";
import {
  claimSpeech,
  isSpeechStale,
  registerActiveAudio,
  registerActiveUtterance,
  notifySpeechStart,
  notifySpeechEnd,
  notifySpeechError,
  logBlockedDuplicate,
} from "@/lib/speech/speechController";
import { buildSpeechCacheKey, type SpeechSessionIdentity } from "@/lib/speech/speechSessionIdentity";
import type { SpeechState } from "@/lib/speech/speechState";
import { buildPageTruthKey } from "@/lib/useActivePageIntelligence";

const SPEECH_OWNER = "study-speech" as const;

type VisibleSpeechMode = "currentPage" | "professor";

const VISIBLE_SPEECH_MODES: ReadonlyArray<{
  id: VisibleSpeechMode;
  label: string;
  description: string;
}> = [
  {
    id: "currentPage",
    label: "Current Page",
    description: "Read the current page from beginning to end using source-faithful text.",
  },
  {
    id: "professor",
    label: "Professor",
    description: "Start a grounded Professor lesson that moves between the PDF and Whiteboard when useful.",
  },
];

// ── "Read From Click" — find the sentence that best matches a clicked snippet ──
function findBestSentenceIndex(sentences: string[], snippet: string): number {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
  const snippetWords = new Set(words(snippet));
  if (snippetWords.size === 0) return 0;
  let bestIdx = 0;
  let bestScore = -1;
  sentences.forEach((s, i) => {
    let score = 0;
    for (const w of words(s)) if (snippetWords.has(w)) score++;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });
  return bestIdx;
}

// ── Current Page mode — link each spoken sentence to its nearest Thought Unit ──
// so Left Panel / Right Panel / PDF stay in sync while the full page is read
// top-to-bottom (literal page coverage, not just the AI-tagged anchors).
const MIN_ANCHOR_OVERLAP = 2;
function matchSentenceToAnchor(sentence: string, anchors: VisualAnchor[]): VisualAnchor | null {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
  const sentenceWords = new Set(words(sentence));
  if (sentenceWords.size === 0 || anchors.length === 0) return null;
  let best: VisualAnchor | null = null;
  let bestScore = 0;
  for (const anchor of anchors) {
    let score = 0;
    for (const w of words(anchor.exactText)) if (sentenceWords.has(w)) score++;
    if (score > bestScore) { bestScore = score; best = anchor; }
  }
  return bestScore >= MIN_ANCHOR_OVERLAP ? best : null;
}

function matchSentenceToThoughtUnit(sentence: string, units: ExpertAnchor[]): ExpertAnchor | null {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
  const sentenceWords = new Set(words(sentence));
  if (sentenceWords.size === 0 || units.length === 0) return null;
  let best: ExpertAnchor | null = null;
  let bestScore = 0;
  for (const unit of units) {
    let score = 0;
    for (const w of words(unit.exactText)) if (sentenceWords.has(w)) score++;
    if (score > bestScore) { bestScore = score; best = unit; }
  }
  return bestScore >= MIN_ANCHOR_OVERLAP ? best : null;
}

// ── Role colour map ──────────────────────────────────────────────────────────

// Matches SpeechSegmentRole exactly — Speech only ever produces these three
// LeftPanel/source-text roles, never RightPanel field names.
const ROLE_COLOR: Record<string, { border: string; text: string; bg: string }> = {
  thesis:          { border: "rgba(251,191,36,0.35)",  text: "#fbbf24", bg: "rgba(251,191,36,0.07)" },
  conceptBlock:    { border: "rgba(147,197,253,0.30)", text: "#93c5fd", bg: "rgba(147,197,253,0.05)"},
  visualAnchor:    { border: "rgba(167,243,208,0.30)", text: "#6ee7b7", bg: "rgba(167,243,208,0.05)"},
};
function roleStyle(role: string) {
  return ROLE_COLOR[role] ?? { border: "rgba(255,255,255,0.12)", text: "#94a3b8", bg: "rgba(255,255,255,0.04)" };
}

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type OAIVoice = typeof OPENAI_VOICES[number];

// ── Text builder ─────────────────────────────────────────────────────────────

function buildSpeechText(
  segments: SpeechSegment[],
  mode: StudySpeechMode,
  model: CurrentPageStudyModel,
  activePageText: string,
  fromSegIdx?: number,
): string {
  const segs = fromSegIdx !== undefined ? segments.slice(fromSegIdx) : segments;
  let text = segs.map(s => s.text).filter(Boolean).join(". ").trim();

  // Fallback chain: if segment text is too sparse, use activePageText
  if (text.length < 20 && activePageText) {
    text = formulaToSpeech(activePageText.slice(0, 4000));
  }

  return text.slice(0, 4000);
}

// ── Naturalize speech for flowing, natural TTS ───────────────────────────────

function naturalizeSpeech(text: string): string {
  let out = text;
  // OCR drop-cap artifacts: standalone capital + space + rest of word → merge
  out = out.replace(/(?<![A-Za-z])([A-HJ-Z]) ([a-z]{2,})(?![a-z])/g, (_, letter, rest) => letter + rest);
  // Ligature normalization
  out = out.replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/ﬀ/g, "ff").replace(/ﬃ/g, "ffi").replace(/ﬄ/g, "ffl");
  out = out.replace(/­/g, ""); // soft hyphen
  out = out.replace(/\s*;\s*/g, ", ");
  out = out.replace(/\s*:\s*/g, " — ");
  out = out.replace(/\(\s*/g, ", ");
  out = out.replace(/\s*\)/g, ",");
  out = out.replace(/&/g, "and");
  out = out.replace(/\betc\.\s*/gi, "and so on. ");
  out = out.replace(/\be\.g\.\s*/gi, "for example, ");
  out = out.replace(/\bi\.e\.\s*/gi, "that is, ");
  out = out.replace(/\bvs\.\s*/gi, "versus ");
  out = out.replace(/\bFig\.\s*(\d)/gi, "Figure $1");
  out = out.replace(/\bet\s+al\.\s*/gi, "and colleagues ");
  out = out.replace(/[ \t]{2,}/g, " ").trim();
  return out;
}

// Final text-to-speech transform applied to a raw sentence/segment, shared by
// the playback loops and by prefetch (so the prefetch cache key matches).
function computeSpeechText(raw: string): string {
  const { text: norm } = normalizeFormulasForSpeech(raw);
  return naturalizeSpeech(formulaToSpeech(norm)).slice(0, 500);
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Null while the Page Brain (RightPanel/OpenAI synthesis) hasn't finished yet —
   *  Current Page mode must still work fully without it, reading activePageText directly. */
  studyModel: CurrentPageStudyModel | null;
  pageNumber: number;
  bookId?: string;
  /** The real resolved per-upload document identity (see
   *  lib/insights/resolveDocumentIdentity.ts) — distinct from bookId, which
   *  is only the filename-derived key and can collide across two different
   *  PDFs that happen to share a filename. Falls back to bookId when a
   *  caller hasn't been updated to pass it, so this cache-identity fix never
   *  breaks an existing call site — but every live call site should pass it. */
  documentId?: string;
  activePageText?: string;
  /** Effective domain preset id retained for the legacy internal speech builder. */
  presetId?: string;
  /** Legacy internal speech callback retained until the compatibility audit removes it. */
  onExplainSegment?: (evidenceRefId: string) => void;
  /** Called in Current Page mode with the current sentence text — drives focusSnippet scroll. */
  onSnippetFocus?: (snippet: string | null) => void;
  /** Fires whenever active read-aloud playback starts/stops — drives the persistent
   *  reading highlight in the PDF (focusHighlightPersist). */
  onPlayStateChange?: (isReading: boolean) => void;
  /** Opens the existing Professor Lesson / Whiteboard engine. */
  onOpenProfessor?: () => void;
  /** Render as the promoted primary Study Tools action ("▶ Listen to this page"),
   *  open by default, instead of the compact collapsed header. */
  primary?: boolean;
  /** Legacy internal speech input retained until the compatibility audit removes it. */
  highlightedAnchorTexts?: string[];
  /** Canonical LeftPanel units used to synchronize Current Page tracking. */
  thoughtUnits?: ExpertAnchor[];
  /** Focused/selected unit used by legacy internal speech compatibility code. */
  selectedUnitId?: string | null;
  /** True when the current page is classified as non-instructional (cover,
   *  title page, copyright/front matter, table of contents, chapter/unit/
   *  section opener, bibliography, index, or similar structural page) — the
   *  SAME classification RightPanel already uses to suppress its own note/
   *  synthesis views (see RightPanel.tsx's `pageBlocked`). Neither Current
   *  Page reading nor Professor should trigger on a page with no
   *  instructional content to read or teach. */
  nonInstructionalPage?: boolean;
}

export interface StudySpeechPanelHandle {
  /** "Read From Click" — switch to Current Page mode and start reading from the
   *  sentence that best matches the clicked PDF text. */
  playFromSnippet: (snippet: string) => void;
  /** Semantic click navigation — prime the resume cursor so the next Play press
   *  starts from the given word position. Does NOT auto-start playback. */
  seekToCursor: (cursor: ReadingCursor) => void;
  /** Start playback from the already-primed cursor (called by Play chip after seekToCursor). */
  triggerPlay: () => void;
  /** Called when Professor/Whiteboard closes — restores Current Page to the
   *  position Professor was actually teaching from (via the same resume
   *  cursor mechanism as a PDF click) and always resets visibleMode back to
   *  "currentPage", whether or not a cursor is available. Does NOT
   *  auto-start playback — same contract as seekToCursor. */
  returnFromProfessor: (cursor: ReadingCursor | null) => void;
}

// ── Main component ───────────────────────────────────────────────────────────

const StudySpeechPanel = forwardRef<StudySpeechPanelHandle, Props>(function StudySpeechPanel(
  { studyModel, pageNumber, bookId, documentId, activePageText = "", presetId = "universal", onExplainSegment, onSnippetFocus, onPlayStateChange, onOpenProfessor, primary = false, highlightedAnchorTexts, thoughtUnits = [], selectedUnitId = null, nonInstructionalPage = false },
  ref,
) {
  // Render counter — diagnostic for React render-loop investigation.
  const spRenderCountRef = useRef(0);
  spRenderCountRef.current++;
  if (DEV) console.log("[SPEECH_RENDER]", spRenderCountRef.current);

  // The real resolved document identity (falls back to bookId only if a
  // caller hasn't been updated yet — see the documentId prop doc comment).
  // Every audio-cache key below is qualified by this, not by bookId alone —
  // fixes the Speech Engine audit's RC2: two different PDFs sharing a
  // filename share the same bookId, so a bookId-only cache reset wouldn't
  // flush stale audio when switching between them.
  const resolvedDocId = documentId || bookId || "";
  const speechIdentity: SpeechSessionIdentity = {
    documentId: resolvedDocId,
    pageNumber,
    pageTruthKey: buildPageTruthKey(resolvedDocId, pageNumber),
    owner: SPEECH_OWNER,
  };

  // Rapid-fire detection for onPlayStateChange — fires [PARENT_WRITE:RAPID] if called
  // more than once within a single 16ms frame (sign of a state-update loop).
  const lastPlayStateWriteRef = useRef(0);

  const [open, setOpen]       = useState(primary);
  const [visibleMode, setVisibleMode] = useState<VisibleSpeechMode>("currentPage");
  // The local reader now has one live playback contract. Legacy low-level mode
  // builders remain below for compatibility until their removal audit is safe.
  const mode: StudySpeechMode = "fullPage";
  const [voice, setVoice]     = useState<OAIVoice>(() => {
    if (typeof window === "undefined") return "alloy";
    try {
      const v = localStorage.getItem("speech_voice");
      if (v && (["alloy","echo","fable","onyx","nova","shimmer"] as string[]).includes(v)) return v as OAIVoice;
    } catch { /* ignore */ }
    return "alloy";
  });
  const [speed, setSpeed]     = useState(() => {
    if (typeof window === "undefined") return 1.0;
    try {
      const v = parseFloat(localStorage.getItem("speech_speed") ?? "");
      if (!isNaN(v)) return Math.max(0.5, Math.min(2.5, v));
    } catch { /* ignore */ }
    return 1.0;
  });
  // Ref mirrors — readable inside async callbacks and event handlers without stale closures.
  const speedRef   = useRef(1.0);
  const segIdxRef  = useRef(0);
  const [segments, setSegments] = useState<SpeechSegment[]>([]);
  // Mirror of segments state kept in a ref for imperative handle access (seekToCursor).
  const segmentsRef = useRef<SpeechSegment[]>([]);
  const [segIdx, setSegIdx]   = useState(0);

  // Reuses the shared SpeechState vocabulary (lib/speech/speechState.ts)
  // instead of a locally-duplicated union — "one shared lifecycle state
  // instead of each surface inventing its own" per the Speech Engine audit.
  type PlayState = SpeechState;
  const [playState, setPlayState] = useState<PlayState>("idle");
  // Ref mirror of playState for async callbacks and effects that need to read
  // the current playing state without stale closures. True when speech is
  // actively producing audio (playing or loading the next segment).
  const isPlayingRef = useRef(false);
  // Tracks the last unit ID that speech itself navigated to (via setThoughtUnit).
  // Used to distinguish speech-driven focus changes from user-initiated ones.
  const speechDrivenUnitIdRef = useRef<string | null>(null);
  // Bridge local PlayState → shared ReadingFocusStore so PDF overlay, ThoughtUnitNavigator,
  // and scroll guards can read playback state without subscribing to this component's local state.
  function updatePlayState(state: PlayState) {
    isPlayingRef.current = state === 'playing' || state === 'loading';
    setPlayState(state);
    const storeState: 'idle' | 'playing' | 'paused' | 'loading' =
      state === 'playing' ? 'playing'
      : state === 'loading' ? 'loading'
      : state === 'paused'  ? 'paused'
      : 'idle';
    useReadingFocusStore.getState().setPlaybackState(storeState);
  }
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  // Eye Guide: tracks the snippet currently being spoken
  const [eyeText, setEyeText]   = useState<string | null>(null);
  const [eyeRole, setEyeRole]   = useState<string | null>(null);
  // Guided mode only: star tier of the segment currently being spoken
  const [eyeTier, setEyeTier]   = useState<{ stars: number; label: string } | null>(null);

  // Natural Reading: word-by-word karaoke sync, layered on top of the Eye Guide
  // text above — words tokenized from the DISPLAYED text; the active index is
  // driven by whichever provider is actually speaking (see beginKaraoke below).
  const [karaokeWords, setKaraokeWords] = useState<SyncWord[]>([]);
  const [activeWordIdx, setActiveWordIdx] = useState(0);
  const [showKaraokeBar, setShowKaraokeBar] = useState(true);
  const spokenWordsRef        = useRef<SyncWord[]>([]);      // tokenized from the SPOKEN text (post formula-normalization)
  const cumulativeWeightsRef  = useRef<number[]>([]);        // estimated start-fraction per spoken word (OpenAI/audio.currentTime path)
  const displayWordsRef       = useRef<SyncWord[]>([]);      // ref mirror of karaokeWords — avoids stale-closure reads from ontimeupdate/onboundary handlers
  const displayWordCountRef   = useRef(0);
  // Which LeftPanel/PDF anchor the currently-playing segment maps to — null for
  // segments with no evidenceRefId (e.g. Full Page mode's raw sentences).
  const activeAnchorIdRef       = useRef<string | null>(null);
  const activeSentenceTextRef   = useRef<string | null>(null);
  // Number of spoken-text prefix words NOT present in rawText/PDF (guided narration phrases).
  // Subtracted from the TTS word index before passing to the PDF word-rect overlay.
  const sourceTextWordOffsetRef = useRef(0);
  // P0 stabilization, Tier 3 — the currently-playing segment's content role.
  // Word-level PDF Eye Guide tracking (useReadingFocusStore.setWord, consumed
  // by WordRectOverlay's geometry search against the real PDF text layer)
  // must only ever run for SOURCE_VERBATIM segments — PROFESSOR_EXPLANATION
  // text is AI-generated prose that was never extracted from this page, so
  // word-matching it against the PDF is either a silent no-op (safe) or,
  // worse, a coincidental match on an unrelated word (a real fuzzy-highlight
  // risk). beginKaraoke()/onSpokenWordIndex() both gate their setWord() call
  // on this ref rather than skipping karaoke state entirely — the panel's
  // own on-screen reading-bar highlight is legitimate for either role.
  const activeContentRoleRef = useRef<SpeechContentRole>("SOURCE_VERBATIM");
  // Phase 11 — speech mode continuity refs.
  // Anchor to resume from when the user switches modes mid-playback.
  const resumeAnchorIdRef  = useRef<string | null>(null);
  // Segment index to resume from in the new mode's timeline (resolved from resumeAnchorIdRef).
  const resumeSegIdxRef    = useRef(0);
  // Persists lastMatchedId out of the fullPage loop so mode-switch can read it.
  const lastMatchedIdRef   = useRef<string | null>(null);
  // Previous mode — used in the SPEECH_CURSOR_REMAP log.
  const prevModeRef        = useRef<string>(mode);
  // Resume source context captured alongside the anchor so the rebuild effect
  // can run multi-level resolution: exact ID → sourceText → nearest-following → restart.
  const resumeSourceTextRef = useRef<string | null>(null);
  const resumeWordIndexRef  = useRef(0);
  // Atomic seek cursor — set by seekToCursor(), consumed on the first resumed segment.
  const pendingSeekCursorRef = useRef<{
    segmentIndex: number;
    canonicalAnchorId: string | null;
    sourceText: string;
    sourceWordIndex: number;
    sourceCharOffset: number;
  } | null>(null);
  // PDF word-rect offset applied in onSpokenWordIndex for the first resumed segment only.
  // Reset to 0 before every subsequent segment so normal tracking resumes from word 0.
  const seekWordStartRef = useRef(0);

  // Tokenizes both the displayed and spoken text variants for the segment about
  // to be read, and resets the karaoke cursor to the first word. Call this
  // alongside every setEyeText(...) so word-sync always matches what's playing.
  // anchorId threads through to onActiveWordChange so every mode (not just the
  // local Eye Guide box) can track the live spoken word against its source anchor.
  // rawText is the pre-TTS sentence (matches the PDF text layer); spokenText may be
  // TTS-processed (acronyms expanded, symbols replaced) and won't match PDF spans.
  // wordOffset: how many prefix words in the TTS text are absent from rawText/PDF.
  // Non-zero only in Guided mode segments that have narration prefixes. The PDF
  // word-rect index must subtract this so the yellow box tracks the anchor text,
  // not the narration prefix.
  function beginKaraoke(displayText: string, spokenText: string, anchorId: string | null = null, rawText?: string, wordOffset = 0, contentRole: SpeechContentRole = "SOURCE_VERBATIM") {
    const displayWords = tokenizeWords(displayText);
    const spokenWords  = tokenizeWords(spokenText);
    setKaraokeWords(displayWords);
    setActiveWordIdx(0);
    spokenWordsRef.current          = spokenWords;
    cumulativeWeightsRef.current    = estimateWordWeights(spokenWords);
    displayWordsRef.current         = displayWords;
    displayWordCountRef.current     = displayWords.length;
    activeAnchorIdRef.current       = anchorId;
    activeSentenceTextRef.current   = rawText ?? spokenText;
    sourceTextWordOffsetRef.current = wordOffset;
    activeContentRoleRef.current    = contentRole;
    // PDF word-level Eye Guide only for verbatim source text — see
    // activeContentRoleRef's doc comment above.
    if (contentRole === "SOURCE_VERBATIM") {
      useReadingFocusStore.getState().setWord(anchorId, 0, displayWords[0]?.word ?? "", rawText ?? spokenText);
    }
    // Request-time snapshot: emitted before PDF has painted. pdfTargetMatched and
    // pdfWordRectRendered are NOT included here — they are false at this point even
    // when the overlay will render correctly milliseconds later. Confirmation comes from
    // [THOUGHT_UNIT_WORD_SYNC_RENDERED] emitted by WordRectOverlay after the rect paints.
    const _s = buildCanonicalSyncState(anchorId, mode, 0);
    if (DEV) console.log("[THOUGHT_UNIT_WORD_SYNC_REQUESTED]", {
      canonicalAnchorId:        anchorId,
      mode,
      sourceText:               (rawText ?? spokenText)?.slice(0, 80) ?? null,
      sourceWordIndex:          0,
      leftPanelActiveId:        _s.leftPanelActive     ? anchorId : null,
      expertBrainActiveId:      _s.expertBrainSelected ? anchorId : null,
      studyNoteReferenceCount:  _s.studyNoteReferenceCount,
      connectionReferenceCount: _s.connectionReferenceCount,
      readingBarEnabled:        _s.readingBarEnabled,
    });
  }

  function onSpokenWordIndex(spokenIdx: number) {
    const scaled = scaleIndex(spokenIdx, spokenWordsRef.current.length, displayWordCountRef.current);
    setActiveWordIdx(scaled); // Eye Guide always uses the full scaled index (includes any prefix words)
    // PDF word-level tracking only for verbatim source text — see
    // activeContentRoleRef's doc comment near its declaration.
    if (activeContentRoleRef.current !== "SOURCE_VERBATIM") return;
    // PDF word-rect index skips prefix words that aren't present in the source text.
    const pdfWordIdx = Math.max(0, scaled - sourceTextWordOffsetRef.current) + seekWordStartRef.current;
    useReadingFocusStore.getState().setWord(activeAnchorIdRef.current, pdfWordIdx, displayWordsRef.current[scaled]?.word ?? "", activeSentenceTextRef.current ?? undefined);
  }

  // Builds the [CANONICAL_SYNC] payload from actual runtime consumer state.
  // Each field is derived from a real observable, not assumed from canonicalId being non-null.
  function buildCanonicalSyncState(canonicalId: string | null, segMode: string, sourceWordIndex = 0) {
    const anchorUnit = canonicalId
      ? thoughtUnits.find((u) => u.evidenceRefId === canonicalId)
      : null;
    const store = useReadingFocusStore.getState();

    // PDF: written by SmartPDFViewer after overlay paints; written by WordRectOverlay after word box paints.
    const pdfAnchorRendered = !!(canonicalId && store.pdfRenderedAnchorIds.includes(canonicalId));
    const pdfWordRendered   = store.pdfRenderedWordAnchorId === canonicalId && canonicalId !== null;

    // LeftPanel: card existence → store selection → word-sync box showing.
    const leftPanelExists       = thoughtUnits.some((u) => u.evidenceRefId === canonicalId);
    const leftPanelActive       = store.thoughtUnitId === canonicalId && canonicalId !== null;
    const leftPanelWordRendered = store.word !== null && store.thoughtUnitId === canonicalId && canonicalId !== null;

    // Expert Brain: store selection (set above) → index.tsx → RightPanel → ExpertBrainCard prop.
    // "rendered" approximates as selected + unit in panel (the chain is deterministic once selected).
    const expertBrainSelected = store.thoughtUnitId === canonicalId && canonicalId !== null;
    const expertBrainRendered = expertBrainSelected && leftPanelExists;

    // Study notes: evidenceRefId === VisualAnchor.id (canonicalLeftPanel.ts sets evidenceRefId: anchor.id).
    // Primary: count studyNoteAnchorIds values that match canonicalId directly — no text bridge needed.
    // Fallback: for legacy study models that predate studyNoteAnchorIds, bridge via exactText prefix.
    const studyNoteReferenceCount = (() => {
      if (!canonicalId) return 0;
      if (studyModel?.studyNoteAnchorIds) {
        return Object.values(studyModel.studyNoteAnchorIds).filter((id) => id === canonicalId).length;
      }
      // Legacy fallback: text-prefix match to find the VisualAnchor.id, then can't count — return 1 if matched.
      if (anchorUnit && studyModel?.visualAnchors) {
        const matched = studyModel.visualAnchors.find(
          (va) => va.exactText.slice(0, 50) === anchorUnit.exactText.slice(0, 50)
        );
        return matched ? 1 : 0;
      }
      return 0;
    })();

    // Connections: reuses studyNoteAnchorIds as the per-anchor connection index
    // (no separate connection store; the note-anchor links are the connection record).
    const connectionReferenceCount = studyNoteReferenceCount;

    // Transcript: canonicalMapping = anchor resolved; null === null does NOT imply success.
    const canonicalMapping        = canonicalId !== null;
    const transcriptVisible       = true; // we are in the play loop, eyeText was just set
    const transcriptAnchorMatches = activeAnchorIdRef.current === canonicalId;

    // Reading bar: toggle state vs whether this anchor's segment is showing.
    const readingBarEnabled      = showKaraokeBar;
    const readingBarAnchorMatches = showKaraokeBar && activeAnchorIdRef.current === canonicalId;

    return {
      canonicalAnchorId: canonicalId,
      canonicalMapping,
      pdfAnchorRendered,
      pdfWordRendered,
      leftPanelExists,
      leftPanelActive,
      leftPanelWordRendered,
      expertBrainSelected,
      expertBrainRendered,
      studyNoteReferenceCount,
      connectionReferenceCount,
      transcriptVisible,
      transcriptAnchorMatches,
      readingBarEnabled,
      readingBarAnchorMatches,
      page: pageNumber,
      mode: segMode,
      sourceWordIndex,
    };
  }

  // Auto-scroll so the active karaoke word always stays in view — "eyes never lose place".
  const karaokeBoxRef = useRef<HTMLParagraphElement | null>(null);
  const activeWordRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    activeWordRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeWordIdx]);

  // Guided teach-loop: at a requiresConfirm segment, playback stops and waits for
  // the reader to click Continue (or Explain, then Continue) instead of advancing
  // on a fixed timer — a passive listener still gets a generous auto-continue
  // fallback so they never get stuck.
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const continueResolverRef  = useRef<(() => void) | null>(null);
  const autoContinueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explainEngagedRef    = useRef(false);

  function resolveContinue() {
    if (autoContinueTimerRef.current) { clearTimeout(autoContinueTimerRef.current); autoContinueTimerRef.current = null; }
    const resolve = continueResolverRef.current;
    continueResolverRef.current = null;
    setAwaitingContinue(false);
    explainEngagedRef.current = false;
    resolve?.();
  }

  function waitForContinue(): Promise<void> {
    return new Promise<void>((resolve) => {
      continueResolverRef.current = resolve;
      explainEngagedRef.current = false;
      setAwaitingContinue(true);
      autoContinueTimerRef.current = setTimeout(() => {
        if (!explainEngagedRef.current) resolveContinue();
      }, 4000);
    });
  }

  function explainCurrentSegment(evidenceRefId: string) {
    if (autoContinueTimerRef.current) { clearTimeout(autoContinueTimerRef.current); autoContinueTimerRef.current = null; }
    explainEngagedRef.current = true;
    onExplainSegment?.(evidenceRefId);
  }

  // Active audio element ref — so we can stop/pause
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  // Tracks which provider is currently playing — suppresses false browser errors
  const providerRef = useRef<"openai" | "browser" | null>(null);
  // Abort flag for sequential highlights playback
  const abortRef   = useRef(false);
  // Set by pause() when the user pauses while a segment's TTS is still
  // in-flight (no audio/utterance exists yet to actually pause). Checked by
  // fetchAndPlayAudio/playBrowserSpeech right before they would otherwise
  // start audible playback, so the response is loaded/cached but never
  // auto-played until resume() (RC5, Speech Engine audit).
  const pauseRequestedRef = useRef(false);
  // Monotonic session id — bumped every play() call so stale async loops from a
  // superseded call can detect they've been overtaken and stop producing audio,
  // even though abortRef gets reset to false by the new call.
  const sessionRef = useRef(0);
  const isStale = (session: number) => abortRef.current || sessionRef.current !== session;
  // Allocates a fresh session id and clears the abort flag — call this once per
  // user-initiated playback request, right before kicking off the async loop.
  function beginSession(): number {
    abortRef.current = false;
    return ++sessionRef.current;
  }

  // Cross-component speech token from the shared controller (see
  // lib/speech/speechController.ts) — distinct from sessionRef above, which
  // only guards against *this component's own* superseded play() calls.
  const globalTokenRef = useRef(0);
  // Guards against a second play() firing before the first has finished its
  // synchronous claim/dispatch (e.g. a fast double-click on ▶ Play).
  const isStartingRef = useRef(false);

  // Pending play intent for fullPage mode: set when Play is pressed before page text
  // has been extracted. Cleared and auto-played once fpSentences populates.
  const pendingFullPagePlayRef = useRef<number | null>(null);
  // Timeout ref for the pendingFullPagePlay auto-resume — canceled in stopAudio()
  // to prevent the unmounted-component state-update warning (M1 fix).
  const pendingFullPagePlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current reference to play() — lets effects call it without stale closures.
  const playRef = useRef<(fromIdx?: number) => void>(() => {});

  // TTS prefetch cache — keyed by the exact text sent to /api/tts. Lets the next
  // segment's audio start fetching while the current segment is still playing.
  // The browser-fallback branch carries its script INSIDE the cached value
  // (not a side-channel ref) so a concurrent prefetch for a different segment
  // can never clobber the script a different in-flight caller is about to
  // read (RC7, Speech Engine audit).
  const audioCacheRef = useRef<Map<string, Promise<{ blob: Blob; mimeType: string } | { browser: true; script: string }>>>(new Map());

  // Reset on document change — new document means new context entirely.
  // Depends on resolvedDocId (not bare bookId) so two different PDFs that
  // happen to share a filename — same bookId, different real documentId —
  // still flush the cache on switch (RC2 from the Speech Engine audit).
  useEffect(() => {
    setSegIdx(0);
    setEyeText(null);
    setEyeRole(null);
    setEyeTier(null);
    setKaraokeWords([]);
    setActiveWordIdx(0);
    activeAnchorIdRef.current = null;
    useReadingFocusStore.getState().clearWord();
    stopAudio();
    // Flush blob URL cache so previous document's audio doesn't linger in memory (M4 fix).
    audioCacheRef.current.clear();
    if (DEV) console.log("[EYE_GUIDE_RESET]", { bookId, documentId: resolvedDocId, reason: "document-change" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedDocId]);

  // Reset on page navigation — stops audio and clears eye guide.
  useEffect(() => {
    setSegIdx(0);
    setEyeText(null);
    setEyeRole(null);
    setEyeTier(null);
    setKaraokeWords([]);
    setActiveWordIdx(0);
    activeAnchorIdRef.current = null;
    useReadingFocusStore.getState().clearWord();
    stopAudio();
    // Flush blob URL cache — previous page's audio is invalid on the new page (M4 fix).
    audioCacheRef.current.clear();
    if (DEV) console.log("[EYE_GUIDE_RESET]", { page: pageNumber, reason: "page-change" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  // Keep refs in sync with state so async handlers always see the latest values.
  useEffect(() => { speedRef.current  = speed;  }, [speed]);
  useEffect(() => { segIdxRef.current = segIdx; }, [segIdx]);

  // Persist voice and speed so they survive page reloads.
  useEffect(() => { try { localStorage.setItem("speech_voice", voice); } catch { /* ignore */ } }, [voice]);
  useEffect(() => { try { localStorage.setItem("speech_speed", String(speed)); } catch { /* ignore */ } }, [speed]);

  // Stop local Current Page audio before handing control to Professor/Whiteboard.
  useEffect(() => {
    stopAudio();
    setSegIdx(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMode]);

  // Stop audio when the active thought unit changes — but only for user-initiated
  // selections. Speech itself advances selectedUnitId via setThoughtUnit() and stamps
  // speechDrivenUnitIdRef first; we skip stopAudio() only for those speech-originated
  // changes, so a user clicking a different unit while audio plays still stops it.
  useEffect(() => {
    if (!selectedUnitId) return;
    if (isPlayingRef.current && selectedUnitId === speechDrivenUnitIdRef.current) return;
    stopAudio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitId]);

  // Build the strict, ordered Current Page script directly from extracted source.
  // No heuristic block filtering and no AI/OCR rewrite are allowed on this path.
  const [fpSentences, setFpSentences] = useState<string[]>([]);
  useEffect(() => {
    const sourceSegments = buildCurrentPageSpeechSegments(activePageText);
    setFpSentences(sourceSegments);
    if (DEV) console.log("[CURRENT_PAGE_SOURCE_SCRIPT]", {
      page: pageNumber,
      sourceChars: activePageText.length,
      segmentCount: sourceSegments.length,
      firstSegment: sourceSegments[0]?.slice(0, 80) ?? null,
    });

    // Auto-resume if Play was pressed before this page's text was extracted.
    if (pendingFullPagePlayRef.current !== null && sourceSegments.length > 0) {
      const idx = pendingFullPagePlayRef.current;
      pendingFullPagePlayRef.current = null;
      setErrorMsg(null);
      pendingFullPagePlayTimerRef.current = setTimeout(() => {
        pendingFullPagePlayTimerRef.current = null;
        playRef.current(idx);
      }, 16);
    }
  }, [activePageText, pageNumber]);

  // Rebuild segments when model or mode changes — without stopping audio.
  useEffect(() => {
    if (DEV) console.log("[SPEECH_EFFECT_C_RUN]", {
      mode,
      pageNumber,
      hasStudyModel: !!studyModel,
      thoughtUnitsLen: thoughtUnits.length,
      highlightedAnchorTextsLen: highlightedAnchorTexts?.length ?? 0,
      activePageTextLen: activePageText?.length ?? 0,
    });
    if (mode === "fullPage") {
      // fullPage reads sentences directly from page text — no pre-built segments.
      setSegments([]);
      return;
    }
    // Canonical units are the single source of truth. If not yet available
    // (synthesis still running), segments stay empty and play() shows loading state.
    const next = buildSpeechTimeline({ thoughtUnits, mode, activePageText, presetId, selectedUnitId });
    if (DEV) console.log("[SPEECH_SET_SEGMENTS]", next.length);
    setSegments(next);
    segmentsRef.current = next;

    // Resolve resume position using a 4-level cascade so the canonical reading
    // context is never lost simply because the mode changed:
    //   1. Exact evidenceRefId / segment ID match
    //   2. rawText prefix overlap (handles cross-mode text variants)
    //   3. Nearest following anchor by thoughtUnit reading order
    //   4. Restart (index 0)
    const anchorToResume = resumeAnchorIdRef.current;
    if (next.length > 0) {
      let remapIdx = -1;
      let remapStrategy = "restart";

      if (anchorToResume) {
        // Level 1: exact ID
        remapIdx = next.findIndex(
          (s) => s.evidenceRefId === anchorToResume || s.id === anchorToResume
        );
        if (remapIdx >= 0) remapStrategy = "exact-id";
      }

      if (remapIdx < 0 && resumeSourceTextRef.current) {
        // Level 2: rawText 40-char prefix overlap
        const needle = resumeSourceTextRef.current.slice(0, 60).toLowerCase();
        remapIdx = next.findIndex((s) => {
          const hay = s.rawText.slice(0, 60).toLowerCase();
          return hay.startsWith(needle.slice(0, 40)) || needle.startsWith(hay.slice(0, 40));
        });
        if (remapIdx >= 0) remapStrategy = "source-text";
      }

      if (remapIdx < 0 && anchorToResume) {
        // Level 3: nearest segment whose anchor follows the resume anchor in page order
        const orderIdx = thoughtUnits.findIndex((u) => u.evidenceRefId === anchorToResume);
        if (orderIdx >= 0) {
          const followingIds = new Set(
            thoughtUnits.slice(orderIdx + 1).map((u) => u.evidenceRefId).filter(Boolean) as string[]
          );
          remapIdx = next.findIndex((s) => s.evidenceRefId && followingIds.has(s.evidenceRefId));
          if (remapIdx >= 0) remapStrategy = "nearest-following";
        }
      }

      const resolvedIdx = remapIdx >= 0 ? remapIdx : 0;
      resumeSegIdxRef.current = resolvedIdx;
      if (DEV) console.log("[SPEECH_CURSOR_REMAP]", {
        fromMode: prevModeRef.current,
        toMode: mode,
        anchorId: anchorToResume,
        strategy: remapStrategy,
        remappedIdx: resolvedIdx,
        totalSegments: next.length,
      });
    } else {
      resumeSegIdxRef.current = 0;
    }
    prevModeRef.current = mode;
  }, [studyModel, mode, pageNumber, activePageText, thoughtUnits, selectedUnitId, highlightedAnchorTexts, presetId]);

  // ── Audio helpers ──────────────────────────────────────────────────────────

  function stopAudio() {
    if (providerRef.current) {
      if (DEV) console.log("[SPEECH_CANCEL_PREVIOUS]", { provider: providerRef.current, mode, segIdx });
    }
    // Cancel pending auto-continue timer — page-change calls stopAudio() directly,
    // bypassing resolveContinue(), so the timer must be cleared here (M2 fix).
    if (autoContinueTimerRef.current) { clearTimeout(autoContinueTimerRef.current); autoContinueTimerRef.current = null; }
    // Cancel pending auto-resume timer to prevent state updates on unmounted component (M1 fix).
    if (pendingFullPagePlayTimerRef.current) { clearTimeout(pendingFullPagePlayTimerRef.current); pendingFullPagePlayTimerRef.current = null; }
    abortRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    // Only cancel browser synthesis if it was the active provider
    if (providerRef.current === "browser" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    providerRef.current = null;
    updatePlayState("idle");
    setEyeText(null);
    setEyeRole(null);
    setEyeTier(null);
    setKaraokeWords([]);
    setActiveWordIdx(0);
    activeAnchorIdRef.current = null;
    useReadingFocusStore.getState().clearWord();
    const _nowStop = Date.now();
    if (_nowStop - lastPlayStateWriteRef.current < 16) {
      console.warn("[PARENT_WRITE:RAPID]", "onPlayStateChange double-fire within 16ms", { gap: _nowStop - lastPlayStateWriteRef.current });
    }
    lastPlayStateWriteRef.current = _nowStop;
    if (DEV) console.log("[PARENT_WRITE:StudySpeechPanel] onPlayStateChange false (stop)");
    onPlayStateChange?.(false);
    // Only release the shared controller's active slot if WE currently hold
    // it — never force-stop a different component's speech from here.
    if (globalTokenRef.current && !isSpeechStale(globalTokenRef.current)) {
      notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
    }
  }

  useEffect(() => () => stopAudio(), []);

  // ── TTS fetch helper — returns Promise<{blob,mimeType} | {browser,script}> ──

  // Fetches (and caches) the TTS audio for `text` without playing it. Repeated
  // calls with the same text + voice + content role reuse the request, so
  // prefetching the next segment ahead of time is just a fire-and-forget call.
  function fetchTTS(
    text: string,
    contentRole: SpeechContentRole,
  ): Promise<{ blob: Blob; mimeType: string } | { browser: true; script: string }> {
    const cacheKey = buildSpeechCacheKey(speechIdentity, `${voice}::${contentRole}::${text}`);
    const cached = audioCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const promise = (async (): Promise<{ blob: Blob; mimeType: string } | { browser: true; script: string }> => {
      // Hard timeout — a hung /api/tts request must never leave playback stuck
      // on "Loading…" forever. Abort and let the caller fall back to browser speech.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      let res: Response;
      try {
        res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ script: text, voice, format: "mp3", return: "json", contentRole }),
          signal: controller.signal,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          console.warn("[SPEECH_ERROR]", { source: "openai-tts-fetch", reason: "timeout", timeoutMs: 12000 });
          throw new Error("TTS request timed out");
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) throw new Error(`TTS API ${res.status}`);
      const data = await res.json();

      if (data.audioBase64) {
        if (DEV) console.log("[OPENAI_SPEECH_DONE]", { provider: data.provider ?? "openai", bytes: data.audioBase64.length });
        const bytes = Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0));
        const blob  = new Blob([bytes], { type: data.mimeType || "audio/mpeg" });
        return { blob, mimeType: data.mimeType || "audio/mpeg" };
      }

      if (data.useBrowserSpeech) {
        if (DEV) console.log("[SPEECH_FALLBACK_USED]", { provider: "browser", reason: data.fallbackReason ?? "openai-unavailable" });
        // Use the server's role-aware fallback script. SOURCE_VERBATIM is
        // returned unchanged; Professor narration may be speech-normalized.
        const script = typeof data.script === "string" && data.script.length > 0 ? data.script : text;
        return { browser: true, script };
      }

      throw new Error("Unexpected TTS response");
    })();

    audioCacheRef.current.set(cacheKey, promise);
    promise.catch(() => audioCacheRef.current.delete(cacheKey)); // don't cache failures
    return promise;
  }

  // Kicks off a TTS fetch for the upcoming segment so it's ready by the time
  // playback reaches it. Safe to call with empty/undefined text.
  function prefetchTTS(text: string | undefined | null, contentRole: SpeechContentRole) {
    if (!text) return;
    fetchTTS(text, contentRole).catch(() => {}); // errors surface when actually played
  }

  async function fetchAndPlayAudio(
    text: string,
    session: number,
    contentRole: SpeechContentRole,
  ): Promise<"done" | { browser: true; script: string }> {
    const cacheKey = buildSpeechCacheKey(speechIdentity, `${voice}::${contentRole}::${text}`);
    const result = await fetchTTS(text, contentRole);
    audioCacheRef.current.delete(cacheKey); // one-shot — don't replay stale audio on reuse

    // A newer play() call superseded this request while the fetch was in
    // flight — do NOT touch audioRef/providerRef or start playback, or we'd
    // create a second, simultaneous voice on top of the newer session's audio.
    // Checked against both the local session counter (this component's own
    // supersession) and the shared controller's token (another component may
    // have claimed speech while this fetch was in flight).
    if (isStale(session) || isSpeechStale(globalTokenRef.current)) return "done";

    if ("browser" in result) return result;

    const { blob, mimeType } = result;
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    const audio = new Audio(url);
    audio.playbackRate = speedRef.current;
    audioRef.current   = audio;
    providerRef.current = "openai";
    const token = globalTokenRef.current;
    registerActiveAudio(token, audio, () => stopAudio());
    // Word-by-word karaoke sync: OpenAI TTS gives no timing metadata, so the
    // active word is estimated from playback position against the per-word
    // duration weights computed in beginKaraoke().
    audio.ontimeupdate = () => {
      if (!audio.duration || !isFinite(audio.duration)) return;
      const frac = audio.currentTime / audio.duration;
      onSpokenWordIndex(wordIndexForFraction(cumulativeWeightsRef.current, frac));
    };
    return new Promise((resolve, reject) => {
      audio.onplay  = () => { notifySpeechStart(token, SPEECH_OWNER); if (DEV) { console.log("[SPEECH_UTTERANCE_START]", { source: "openai", mode }); console.log("[SPEECH_AUDIO_PLAY]", { mode }); } updatePlayState("playing"); };
      // Do NOT notifySpeechEnd here — a multi-segment session (Study/Full/Focus/
      // Highlights modes) claims one token for the whole sequence and reuses it
      // across segments via registerActiveAudio. Releasing it after the first
      // segment would make every later fetchAndPlayAudio() call see its own
      // token as stale and silently skip playback. notifySpeechEnd is called
      // once when the whole sequence actually finishes (or is stopped).
      audio.onended = () => { if (DEV) { console.log("[SPEECH_UTTERANCE_END]", { source: "openai", mode }); console.log("[SPEECH_AUDIO_END]", { mode }); } URL.revokeObjectURL(url); blobUrlRef.current = null; resolve("done"); };
      audio.onerror = () => {
        // stopAudio() clears src which fires onerror — treat as clean stop, not failure
        if (abortRef.current || isStale(session) || isSpeechStale(token)) { resolve("done"); return; }
        notifySpeechError(token, SPEECH_OWNER, "openai-audio-playback-failed");
        console.warn("[SPEECH_ERROR]", { source: "openai-audio", mode });
        reject(new Error("Audio playback failed"));
      };
      if (pauseRequestedRef.current) {
        // The user pressed Pause while this segment's TTS was still
        // fetching. The audio is now loaded and ready (via the onplay/
        // onended/onerror handlers just registered above) but must not
        // start until resume() explicitly calls audio.play() — a fresh
        // Audio element is already .paused by default, so resume()'s
        // existing `audioRef.current.paused` check picks this up naturally
        // (RC5, Speech Engine audit).
        pauseRequestedRef.current = false;
        updatePlayState("paused");
        return;
      }
      audio.play().catch((e) => { if (abortRef.current || isStale(session) || isSpeechStale(token)) resolve("done"); else reject(e); });
    });
  }

  // ── Browser speech fallback ─────────────────────────────────────────────────

  function playBrowserSpeech(
    text: string,
    onDone?: () => void,
    session?: number,
    contentRole: SpeechContentRole = "PROFESSOR_EXPLANATION",
  ) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      updatePlayState("error");
      setErrorMsg("Speech not available in this browser.");
      onDone?.();
      return;
    }
    // A newer play() call has already superseded this request — don't speak.
    if ((session !== undefined && isStale(session)) || isSpeechStale(globalTokenRef.current)) {
      onDone?.();
      return;
    }
    providerRef.current = "browser";
    // Current Page must remain source-faithful even in browser fallback.
    // Professor narration may retain the pause-softening behavior.
    const normalized = contentRole === "SOURCE_VERBATIM"
      ? text
      : text
          .replace(/\.\s+/g, ", ")
          .replace(/[!?]\s+/g, ", ")
          .replace(/,\s*,/g, ",")
          .trim();
    const utt = new SpeechSynthesisUtterance(normalized);
    utt.rate  = Math.min(speedRef.current * 1.05, 1.8); // uses ref so rate is correct after mid-playback speed change
    const token = globalTokenRef.current;
    registerActiveUtterance(token, utt, () => stopAudio());

    const superseded = () => (session !== undefined && isStale(session)) || isSpeechStale(token);

    // Watchdog: if onend never fires (stalled synthesis engine), cancel and continue.
    const timeoutMs = Math.min(60000, Math.max(15000, normalized.length * 45));
    let watchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      console.warn("[SPEECH_WATCHDOG]", { source: "browser", charCount: normalized.length, timeoutMs });
      window.speechSynthesis.cancel();
      if (!superseded()) updatePlayState("idle");
      onDone?.();
    }, timeoutMs);
    const clearWatchdog = () => { if (watchdog) { clearTimeout(watchdog); watchdog = null; } };

    utt.onstart = () => { notifySpeechStart(token, SPEECH_OWNER); if (DEV) { console.log("[SPEECH_UTTERANCE_START]", { source: "browser", charCount: normalized.length }); console.log("[SPEECH_AUDIO_PLAY]", { source: "browser", charCount: normalized.length }); } if (!superseded()) updatePlayState("playing"); };
    // Word-by-word karaoke sync: browser TTS fires real boundary events with an
    // exact charIndex into `normalized` — no estimation needed. `normalized`
    // only substitutes punctuation (never adds/removes words), so its word
    // count matches spokenWordsRef's tokenization of the pre-normalization
    // spoken text 1:1, and the index is used as-is.
    utt.onboundary = (e) => {
      if (superseded() || e.name !== "word") return;
      onSpokenWordIndex(wordIndexForCharIndex(spokenWordsRef.current, e.charIndex));
    };
    // See the comment on fetchAndPlayAudio's audio.onended — same reasoning:
    // don't release the shared session token after just one segment.
    utt.onend   = () => { clearWatchdog(); if (DEV) { console.log("[SPEECH_UTTERANCE_END]", { source: "browser" }); console.log("[SPEECH_AUDIO_END]", { source: "browser" }); } if (!superseded()) updatePlayState("idle"); onDone?.(); };
    utt.onerror = (e) => {
      clearWatchdog();
      // "canceled"/"interrupted" = intentional stop — resolve so the play loop can exit cleanly.
      if (e.error === "canceled" || e.error === "interrupted") { onDone?.(); return; }
      if (providerRef.current !== "browser") { onDone?.(); return; } // OpenAI took over
      if (superseded()) { onDone?.(); return; }
      notifySpeechError(token, SPEECH_OWNER, e.error);
      console.warn("[SPEECH_ERROR]", { source: "browser", error: e.error });
      updatePlayState("error");
      setErrorMsg("Speech is temporarily unavailable. Please try again.");
      onDone?.();
    };
    // Belt-and-suspenders: the shared controller already force-cancels any
    // previous speech synthesis on claimSpeech(), but cancel() again here in
    // case this call came from a path that didn't go through claimSpeech.
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
    if (pauseRequestedRef.current) {
      // Pause was requested while this segment's TTS fetch (which is what
      // decided we're falling back to browser speech) was still in flight.
      // speechSynthesis has no "prepare paused" primitive — speak() then an
      // immediate synchronous pause() is the standard workaround, and it
      // reliably beats the async onstart event in practice (RC5, Speech
      // Engine audit).
      pauseRequestedRef.current = false;
      window.speechSynthesis.pause();
      updatePlayState("paused");
    }
  }

  // ── Full Page: sentence-by-sentence playback ──────────────────────────────

  async function playFullPageSequential(sentences: string[], fromIdx: number, session: number) {
    updatePlayState("loading");
    const _nowPlay = Date.now();
    if (_nowPlay - lastPlayStateWriteRef.current < 16) {
      console.warn("[PARENT_WRITE:RAPID]", "onPlayStateChange double-fire within 16ms", { gap: _nowPlay - lastPlayStateWriteRef.current });
    }
    lastPlayStateWriteRef.current = _nowPlay;
    if (DEV) console.log("[PARENT_WRITE:StudySpeechPanel] onPlayStateChange true (fullPage start)");
    onPlayStateChange?.(true);

    // [DIAGNOSIS] State at play start — reveals stale segIdx and sentence zero issue
    if (DEV) console.log("[EYE_GUIDE_START_INDEX]", {
      page:         pageNumber,
      mode,
      fromIdx,
      segIdx,                                          // current state — if >0, stale from prev page
      totalSentences: sentences.length,
      sentence0:    sentences[0]?.slice(0, 80) ?? null,
      sentence1:    sentences[1]?.slice(0, 80) ?? null,
      sentence3:    sentences[3]?.slice(0, 80) ?? null, // sentence "4" (0-indexed 3)
    });

    // Start from the explicit cursor. Default Play passes 0, so Current Page
    // always begins at the first source segment.
    const effectiveFromIdx = fromIdx;
    // Tracks the most-recently matched thought unit so the left panel stays on the
    // "current chapter" even for body-text sentences (Spotify lyrics behaviour).
    let lastMatchedId: string | null = null;
    if (DEV) console.log("[EYE_GUIDE_START_BLOCK]", { idx: effectiveFromIdx, text: sentences[effectiveFromIdx]?.slice(0, 80) ?? null, page: pageNumber });
    if (DEV) console.log("[CURRENT_PAGE_SPEECH_START]", {
      page: pageNumber,
      sentenceIndex: effectiveFromIdx,
      wordIndex: 0,
      textPreview: sentences[effectiveFromIdx]?.slice(0, 120) ?? null,
    });

    for (let i = effectiveFromIdx; i < sentences.length; i++) {
      if (isStale(session)) break;
      if (i === effectiveFromIdx && DEV) console.log("[SPEECH_PLAY_START]", { mode: "fullPage", fromIdx, totalSentences: sentences.length, page: pageNumber, first: sentences[i]?.slice(0, 80) });
      const raw = sentences[i];
      // seekWordStartRef MUST be reset to 0 at the top of every iteration (not just i>0)
      // so the clicked-word offset cannot leak from the first segment into later segments.
      // pendingSeekCursorRef was already nulled when consumed — this reset is the final guard.
      seekWordStartRef.current = 0;
      let ttsText = raw;
      let eyeText = raw.slice(0, 160);
      if (i === effectiveFromIdx) {
        const seekCursor = pendingSeekCursorRef.current;
        if (seekCursor) {
          // Always consume the cursor on the first iteration regardless of whether the
          // text matches — a cursor that misses must not leak into the next play session.
          pendingSeekCursorRef.current = null;
          const needle = seekCursor.sourceText.slice(0, 40).toLowerCase();
          if (raw.toLowerCase().includes(needle)) {
            const rawWords = tokenizeWords(raw);
            const wordIdx = Math.min(seekCursor.sourceWordIndex, Math.max(0, rawWords.length - 1));
            seekWordStartRef.current = wordIdx;
            const slicedRaw = rawWords[wordIdx] ? raw.slice(rawWords[wordIdx].start) : raw;
            ttsText = slicedRaw || raw;
            eyeText = slicedRaw.slice(0, 160) || eyeText;
            if (DEV) console.log("[SPEECH_CURSOR_CONSUMED]", { mode: "fullPage", sentenceIdx: i, wordIdx, ttsPreview: ttsText.slice(0, 80) });
          }
        }
      }
      if (DEV) console.log("[SPEECH_TEXT_READY]", { segIdx: i, mode: "fullPage", charCount: ttsText.length });
      if (DEV) console.log("[SPEECH_TTS_TEXT_READY]", { segIdx: i, charCount: ttsText.length, preview: ttsText.slice(0, 60) });
      if (DEV) console.log("[SPEECH_FINAL_TTS_TEXT]", { segIdx: i, page: pageNumber, text: ttsText.slice(0, 200) });
      setSegIdx(i);
      setEyeText(eyeText);
      setEyeRole("fullPage");
      setEyeTier(null);
      const matchedUnit = matchSentenceToThoughtUnit(raw, thoughtUnits);
      const matchedAnchor = matchedUnit ? null : matchSentenceToAnchor(raw, studyModel?.visualAnchors ?? []);
      // VisualAnchor.id is a synthetic positional key ("va-p3-thesis-0") that never
      // matches HighlightTarget.evidenceRefId. When the sentence only matched a
      // VisualAnchor, resolve the real evidenceRefId by finding the ExpertAnchor
      // (thoughtUnits) whose verbatim text matches the VisualAnchor's text.
      const matchedExpert = !matchedUnit && matchedAnchor
        ? (thoughtUnits.find(u =>
            u.exactText.slice(0, 50) === matchedAnchor.exactText.slice(0, 50)
          ) ?? null)
        : null;
      const matchedId = matchedUnit?.evidenceRefId ?? matchedExpert?.evidenceRefId ?? null;
      if (matchedId) { lastMatchedId = matchedId; lastMatchedIdRef.current = matchedId; }
      if (DEV) console.log("[SPEECH_SEEK_OFFSET]", {
        segIdx: i, canonicalAnchorId: matchedId ?? lastMatchedId,
        cursorConsumed: seekWordStartRef.current > 0,
        clickedWordStart: seekWordStartRef.current,
        narrationPrefixOffset: 0, effectivePrefixOffset: 0,
        resultingPdfStartIndex: seekWordStartRef.current,
      });
      // Tokenize the complete spoken source segment; only the compact preview is
      // visually truncated. This keeps word tracking valid beyond 160 characters.
      beginKaraoke(ttsText, ttsText, matchedId ?? lastMatchedId, raw, 0, "SOURCE_VERBATIM");

      if (DEV) console.log("[SPEECH_SEGMENT_START]", { segIdx: i, role: "fullPage", charCount: ttsText.length, totalSentences: sentences.length });
      if (DEV) console.log("[OPENAI_SPEECH_START]", { segIdx: i, charCount: ttsText.length, voice, mode: "fullPage" });
      onSnippetFocus?.(raw); // drives PDF text-layer highlight in SmartPDFViewer (left panel)

      // Always emit the nearest matched thought unit so the left panel follows
      // speech like Spotify lyrics — even body-text sentences keep a section active.
      const focusId = matchedId ?? lastMatchedId;
      if (focusId) {
        if (DEV) console.log("[SPEECH_EYE_FOCUS]", { segIdx: i, evidenceRefId: focusId, exact: !!matchedId, source: matchedUnit ? "canonical-unit" : matchedExpert ? "visual-anchor" : "nearest-carried" });
        speechDrivenUnitIdRef.current = focusId;
        useReadingFocusStore.getState().setThoughtUnit(focusId);
      }
      if (DEV) console.log("[CANONICAL_SYNC]", buildCanonicalSyncState(focusId ?? null, "fullPage", 0));

      // Prefetch the next sentence's audio while this one plays.
      if (i + 1 < sentences.length) prefetchTTS(sentences[i + 1], "SOURCE_VERBATIM");

      try {
        const result = await fetchAndPlayAudio(ttsText, session, "SOURCE_VERBATIM");
        if (isStale(session)) break;
        if (result !== "done") {
          await new Promise<void>((resolve) => playBrowserSpeech(result.script, resolve, session, "SOURCE_VERBATIM"));
        }
        if (!isStale(session) && i < sentences.length - 1) {
          await new Promise((r) => setTimeout(r, 150));
        }
      } catch (err: unknown) {
        if (isStale(session)) break;
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[OPENAI_SPEECH_ERROR]", { error: message, segIdx: i, mode: "fullPage" });
        console.warn("[SPEECH_ERROR]", { source: "openai", segIdx: i, mode: "fullPage", error: message });
        await new Promise<void>((resolve) => playBrowserSpeech(ttsText, resolve, session, "SOURCE_VERBATIM"));
      }
    }

    if (!isStale(session)) {
      notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
      updatePlayState("idle");
      onSnippetFocus?.(null);
      // Clear word-level sync so the yellow word-box disappears; preserve evidence
      // focus so the last-read TU stays highlighted in LeftPanel/PDF/Expert Brain.
      useReadingFocusStore.getState().clearWord();
    }
    if (DEV) console.log("[PARENT_WRITE:StudySpeechPanel] onPlayStateChange false (fullPage end)");
    onPlayStateChange?.(false);
  }

  // ── Per-segment sequential playback (highlights mode) ─────────────────────

  async function playHighlightsSequential(segs: SpeechSegment[], fromIdx: number, session: number) {
    updatePlayState("loading");

    for (let i = fromIdx; i < segs.length; i++) {
      if (isStale(session)) break;
      const seg = segs[i];
      setSegIdx(i);

      if (DEV) console.log("[SPEECH_SEGMENT_START]", { segIdx: i, id: seg.id, evidenceRefId: seg.evidenceRefId, charCount: seg.text.length, role: seg.role });
      setEyeText(seg.text.slice(0, 160));
      setEyeRole(seg.role ?? "highlights");
      setEyeTier(null);
      if (seg.evidenceRefId) {
        if (DEV) console.log("[SPEECH_SEGMENT_FOCUS]", { evidenceRefId: seg.evidenceRefId, segIdx: i, totalSegs: segs.length, source: "speech-highlights-mode" });
        if (DEV) console.log("[LEFT_PANEL_FOCUS_EVIDENCE]", { evidenceRefId: seg.evidenceRefId, segIdx: i, source: "speech-segment" });
        speechDrivenUnitIdRef.current = seg.evidenceRefId;
        useReadingFocusStore.getState().setThoughtUnit(seg.evidenceRefId);
      }

      const { hasMath: hMath, hasScience: hSci, transformations: hTx } = normalizeFormulasForSpeech(seg.text);
      if (hTx > 0 && DEV) console.log("[SPEECH_FORMULA_NORMALIZATION]", { segIdx: i, transformations: hTx, hasMath: hMath, hasScience: hSci });
      if (hMath && DEV)  console.log("[SPEECH_MATH_DETECTED]",    { segIdx: i, preview: seg.text.slice(0, 60) });
      if (hSci && DEV)   console.log("[SPEECH_SCIENCE_DETECTED]", { segIdx: i, preview: seg.text.slice(0, 60) });
      const hText = computeSpeechText(seg.text);
      // Reset before every segment — prevents clicked-word offset leaking past the first segment.
      seekWordStartRef.current = 0;
      let ttsHText = hText;
      let eyeHText = seg.text.slice(0, 160);
      let hWordOffset = seg.sourceTextWordOffset ?? 0;
      if (i === fromIdx) {
        const seekCursor = pendingSeekCursorRef.current;
        if (seekCursor) {
          // Always clear the cursor — if text doesn't match, we still consume it
          // rather than letting it poison the next play() call (H3 fix).
          pendingSeekCursorRef.current = null;
          const srcText = seg.rawText ?? seg.text;
          const needle = seekCursor.sourceText.slice(0, 40).toLowerCase();
          if (srcText.toLowerCase().includes(needle)) {
            const rawWords = tokenizeWords(srcText);
            const wordIdx = Math.min(seekCursor.sourceWordIndex, Math.max(0, rawWords.length - 1));
            seekWordStartRef.current = wordIdx;
            const slicedRaw = rawWords.slice(wordIdx).map((w: SyncWord) => w.word).join(" ");
            ttsHText = computeSpeechText(slicedRaw || hText);
            eyeHText = slicedRaw.slice(0, 160) || eyeHText;
            // Narration prefix was stripped from the sliced TTS — don't subtract it again.
            hWordOffset = 0;
            if (DEV) console.log("[SPEECH_CURSOR_CONSUMED]", { mode: "highlights", segIdx: i, wordIdx, ttsPreview: ttsHText.slice(0, 80) });
          }
        }
      }
      if (DEV) console.log("[SPEECH_SEEK_OFFSET]", {
        segIdx: i, canonicalAnchorId: seg.evidenceRefId ?? null,
        cursorConsumed: seekWordStartRef.current > 0,
        clickedWordStart: seekWordStartRef.current,
        narrationPrefixOffset: seg.sourceTextWordOffset ?? 0,
        effectivePrefixOffset: hWordOffset,
        resultingPdfStartIndex: seekWordStartRef.current,
      });
      beginKaraoke(eyeHText, ttsHText, seg.evidenceRefId ?? null, seg.rawText, hWordOffset, seg.contentRole);
      if (DEV) console.log("[CANONICAL_SYNC]", buildCanonicalSyncState(seg.evidenceRefId ?? null, "highlights", seg.sourceTextWordOffset ?? 0));
      if (DEV) console.log("[SPEECH_TEXT_READY]", { segIdx: i, mode: "highlights", charCount: ttsHText.length });
      if (DEV) console.log("[SPEECH_TTS_TEXT_READY]", { segIdx: i, charCount: ttsHText.length, preview: ttsHText.slice(0, 60) });
      if (DEV) console.log("[OPENAI_SPEECH_START]", { segIdx: i, charCount: ttsHText.length, voice, evidenceRefId: seg.evidenceRefId });

      // Prefetch the next segment's audio while this one plays.
      if (i + 1 < segs.length) prefetchTTS(computeSpeechText(segs[i + 1].text), segs[i + 1].contentRole);

      try {
        const result = await fetchAndPlayAudio(ttsHText, session, seg.contentRole);
        if (isStale(session)) break; // user stopped, or a newer play() superseded this loop
        if (result !== "done") {
          await new Promise<void>((resolve) => playBrowserSpeech(result.script, resolve, session, seg.contentRole));
        }
        // Small pause between segments
        if (!isStale(session) && i < segs.length - 1) {
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch (err: unknown) {
        if (isStale(session)) break; // user stopped — not an OpenAI failure, no fallback
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[OPENAI_SPEECH_ERROR]", { error: message, segIdx: i });
        console.warn("[SPEECH_ERROR]", { source: "openai", segIdx: i, mode: "highlights", error: message });
        if (DEV) console.log("[SPEECH_FALLBACK_USED]", { provider: "browser", reason: "openai-error" });
        await new Promise<void>((resolve) => playBrowserSpeech(ttsHText, resolve, session, seg.contentRole));
      }
    }

    if (!isStale(session)) {
      notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
      updatePlayState("idle");
      useReadingFocusStore.getState().clearWord();
    }
  }

  // ── Main play ──────────────────────────────────────────────────────────────

  // Silent fallback used when the requested mode has nothing to read (e.g. the
  // Page Brain hasn't synthesized yet, or has no anchors for this page) — instead
  // of surfacing an error and stopping, just read the raw page text.
  function fallbackToPageText(fromIdx: number, session: number, reason: string) {
    const sents = fpSentences.length > 0 ? fpSentences : buildCurrentPageSpeechSegments(activePageText);
    if (!sents.length) {
      setErrorMsg("No page text available.");
      updatePlayState("idle");
      return;
    }
    if (DEV) console.log("[SPEECH_FALLBACK_USED]", { provider: "page-text", reason, mode, sentenceCount: sents.length });
    playFullPageSequential(sents, fromIdx < sents.length ? fromIdx : 0, session);
  }

  async function play(fromIdx = 0) {
    if (isStartingRef.current) {
      logBlockedDuplicate(SPEECH_OWNER);
      return;
    }
    isStartingRef.current = true;
    if (DEV) console.log("[SPEECH_START_REQUEST]", { mode, fromIdx, segmentCount: segments.length, pageNumber, hasStudyModel: !!studyModel });
    if (DEV) console.log("[SPEECH_PLAY_REQUEST]", { mode, fromIdx, segmentCount: segments.length, pageNumber });
    stopAudio();
    // claimSpeech() force-stops any speech currently active in ANY component
    // (this one or another) before we start a new one.
    globalTokenRef.current = claimSpeech(SPEECH_OWNER);
    const session = beginSession();
    setErrorMsg(null);
    if (DEV) console.log("[SPEECH_START]", { mode, fromIdx, session });
    // Debounce window for a fast double-click on ▶ Play — released shortly
    // after, well before this segment's own audio would naturally finish.
    setTimeout(() => { isStartingRef.current = false; }, 400);

    // Full Page mode: sentence-by-sentence through activePageText
    if (mode === "fullPage") {
      // Use the pre-computed strict source script, or build the same script
      // synchronously if extraction landed before the effect committed.
      const sents = fpSentences.length > 0 ? fpSentences : buildCurrentPageSpeechSegments(activePageText);
      if (!sents.length) {
        if (!activePageText) {
          // PDF text extraction is async — text not yet available for this page.
          // Store the play intent; fpSentences effect will auto-resume once text arrives.
          setErrorMsg("Loading page text…");
          pendingFullPagePlayRef.current = fromIdx;
        } else {
          setErrorMsg("No page text available.");
        }
        updatePlayState("idle");
        return;
      }
      const startIdx = Math.max(0, Math.min(fromIdx, Math.max(0, sents.length - 1)));
      if (DEV) console.log("[CURRENT_PAGE_START_POSITION]", {
        page: pageNumber,
        startMode: fromIdx === 0 ? "page-start" : "explicit-cursor",
        sentenceIndex: startIdx,
        sentencePreview: sents[startIdx]?.slice(0, 80) ?? null,
      });
      if (DEV) console.log("[SPEECH_FULL_PAGE_START]", { sentenceCount: sents.length, fromIdx: startIdx, firstSentence: sents[startIdx]?.slice(0, 80) });
      if (DEV) console.log("[SPEECH_SOURCE]", {
        mode: "fullPage",
        source: "activePageText, each sentence matched to nearest finalStudyModel.visualAnchors entry",
        sentenceCount: sents.length,
        charCount: activePageText.length,
        anchorPoolSize: studyModel?.visualAnchors?.length ?? 0,
        anchorPoolIds: (studyModel?.visualAnchors ?? []).map((a) => a.id),
        canonicalUnitCount: thoughtUnits.length,
      });
      if (DEV) console.log("[SPEECH_TEXT_READY]", { mode: "fullPage", sentenceCount: sents.length });
      playFullPageSequential(sents, startIdx, session);
      return;
    }

    // Highlights mode: per-segment sequential playback with PDF focus
    if (mode === "highlights") {
      const segsToPlay = segments.length > 0 ? segments : buildSpeechTimeline({ thoughtUnits, mode: "highlights", activePageText, selectedUnitId, presetId });
      if (!segsToPlay.length) { fallbackToPageText(fromIdx, session, "no-highlight-anchors"); return; }
      if (DEV) console.log("[SPEECH_SOURCE]", {
        mode: "highlights",
        source: "finalStudyModel.visualAnchors",
        itemCount: segsToPlay.length,
        charCount: segsToPlay.reduce((n, s) => n + s.text.length, 0),
        anchorIds: segsToPlay.map((s) => s.evidenceRefId ?? null),
      });
      if (DEV) console.log("[SPEECH_EYE_GUIDE_SOURCE]", {
        mode: "highlights",
        segmentCount: segsToPlay.length,
        evidenceRefIds: segsToPlay.map((s) => s.evidenceRefId ?? null),
        note: "each evidenceRefId will drive focusedEvidenceId → PDF rect scroll",
      });
      playHighlightsSequential(segsToPlay, fromIdx, session);
      return;
    }

    // study | full | focus — sequential per-segment, fires onEvidenceFocus per step.
    // This gives the same Left Panel eye guidance as highlights mode.
    const segsToPlay = segments.length > 0 ? segments : buildSpeechTimeline({ thoughtUnits, mode, activePageText, selectedUnitId, presetId });
    if (!segsToPlay.length) {
      fallbackToPageText(fromIdx, session, "page-brain-not-ready");
      return;
    }

    if (DEV) console.log("[SPEECH_SOURCE]", {
      mode,
      source: "finalStudyModel.visualAnchors via buildSpeechScript (LeftPanel order)",
      itemCount: segsToPlay.length,
      charCount: segsToPlay.reduce((n, s) => n + s.text.length, 0),
      anchorIds: segsToPlay.map((s) => s.evidenceRefId ?? null),
    });

    updatePlayState("loading");

    for (let i = fromIdx; i < segsToPlay.length; i++) {
      if (isStale(session)) break;
      const seg = segsToPlay[i];
      setSegIdx(i);

      setEyeText(seg.text.slice(0, 160));
      setEyeRole(seg.role ?? mode);
      setEyeTier(seg.tier ?? null);
      if (seg.evidenceRefId) {
        speechDrivenUnitIdRef.current = seg.evidenceRefId;
        useReadingFocusStore.getState().setThoughtUnit(seg.evidenceRefId);
        if (DEV) console.log("[SPEECH_EYE_FOCUS]", {
          segIdx: i, mode, evidenceRefId: seg.evidenceRefId, role: seg.role,
        });
      }
      if (DEV) console.log("[SPEECH_SEGMENT_START]", {
        segIdx: i, mode, role: seg.role, charCount: seg.text.length,
      });
      const { hasMath: segMath, hasScience: segSci, transformations: segTx } = normalizeFormulasForSpeech(seg.text);
      if (segTx > 0 && DEV) console.log("[SPEECH_FORMULA_NORMALIZATION]", { segIdx: i, transformations: segTx, hasMath: segMath, hasScience: segSci });
      if (segMath && DEV)   console.log("[SPEECH_MATH_DETECTED]",    { segIdx: i, preview: seg.text.slice(0, 60) });
      if (segSci && DEV)    console.log("[SPEECH_SCIENCE_DETECTED]", { segIdx: i, preview: seg.text.slice(0, 60) });
      const segText = computeSpeechText(seg.text);
      // Reset before every segment — prevents clicked-word offset leaking past the first segment.
      seekWordStartRef.current = 0;
      let ttsSegText = segText;
      let eyeSegText = seg.text.slice(0, 160);
      let segWordOffset = seg.sourceTextWordOffset ?? 0;
      if (i === fromIdx) {
        const seekCursor = pendingSeekCursorRef.current;
        if (seekCursor) {
          // Always clear the cursor — if text doesn't match, we still consume it
          // rather than letting it poison the next play() call (H3 fix).
          pendingSeekCursorRef.current = null;
          const srcText = seg.rawText ?? seg.text;
          const needle = seekCursor.sourceText.slice(0, 40).toLowerCase();
          if (srcText.toLowerCase().includes(needle)) {
            const rawWords = tokenizeWords(srcText);
            const wordIdx = Math.min(seekCursor.sourceWordIndex, Math.max(0, rawWords.length - 1));
            seekWordStartRef.current = wordIdx;
            const slicedRaw = rawWords.slice(wordIdx).map((w: SyncWord) => w.word).join(" ");
            ttsSegText = computeSpeechText(slicedRaw || segText);
            eyeSegText = slicedRaw.slice(0, 160) || eyeSegText;
            // Guided narration prefix was stripped from the sliced TTS — zero the offset so
            // sourceTextWordOffsetRef doesn't double-subtract it from the PDF word index.
            segWordOffset = 0;
            if (DEV) console.log("[SPEECH_CURSOR_CONSUMED]", { mode, segIdx: i, wordIdx, ttsPreview: ttsSegText.slice(0, 80) });
          }
        }
      }
      if (DEV) console.log("[SPEECH_SEEK_OFFSET]", {
        segIdx: i, canonicalAnchorId: seg.evidenceRefId ?? null,
        cursorConsumed: seekWordStartRef.current > 0,
        clickedWordStart: seekWordStartRef.current,
        narrationPrefixOffset: seg.sourceTextWordOffset ?? 0,
        effectivePrefixOffset: segWordOffset,
        resultingPdfStartIndex: seekWordStartRef.current,
      });
      beginKaraoke(eyeSegText, ttsSegText, seg.evidenceRefId ?? null, seg.rawText, segWordOffset, seg.contentRole);
      if (DEV) console.log("[CANONICAL_SYNC]", buildCanonicalSyncState(seg.evidenceRefId ?? null, mode, seg.sourceTextWordOffset ?? 0));
      if (DEV) console.log("[SPEECH_TEXT_READY]", { segIdx: i, mode, charCount: ttsSegText.length });
      if (DEV) console.log("[SPEECH_TTS_TEXT_READY]", { segIdx: i, charCount: ttsSegText.length, mode, preview: ttsSegText.slice(0, 60) });
      if (DEV) console.log("[OPENAI_SPEECH_START]", { segIdx: i, charCount: ttsSegText.length, voice });

      // Prefetch the next segment's audio while this one plays.
      if (i + 1 < segsToPlay.length) prefetchTTS(computeSpeechText(segsToPlay[i + 1].text), segsToPlay[i + 1].contentRole);

      try {
        const result = await fetchAndPlayAudio(ttsSegText, session, seg.contentRole);
        if (isStale(session)) break;
        if (result !== "done") {
          await new Promise<void>((resolve) => playBrowserSpeech(result.script, resolve, session, seg.contentRole));
        }
        if (!isStale(session) && i < segsToPlay.length - 1) {
          if (mode === "guided" && seg.requiresConfirm) {
            await waitForContinue();
          } else {
            await new Promise((r) => setTimeout(r, seg.pauseAfterMs ?? 250));
          }
        }
      } catch (err: unknown) {
        if (isStale(session)) break;
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[OPENAI_SPEECH_ERROR]", { error: message, segIdx: i, mode });
        console.warn("[SPEECH_ERROR]", { source: "openai", segIdx: i, mode, error: message });
        if (DEV) console.log("[SPEECH_FALLBACK_USED]", { provider: "browser", reason: "openai-error" });
        await new Promise<void>((resolve) => playBrowserSpeech(ttsSegText, resolve, session, seg.contentRole));
      }
    }

    if (!isStale(session)) {
      notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
      updatePlayState("idle");
      useReadingFocusStore.getState().clearWord();
    }
  }

  // Keep playRef current on every render so effects can call play() without
  // stale-closure reads of activePageText / fpSentences.
  playRef.current = play;

  // Pause without aborting the sequential playback loop — the in-flight
  // fetchAndPlayAudio()/playBrowserSpeech() promise stays pending until resume()
  // lets the underlying audio/utterance finish naturally.
  function pause() {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      updatePlayState("paused");
    } else if (providerRef.current === "browser" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.pause();
      updatePlayState("paused");
    } else if (playState === "loading") {
      // No audio/utterance exists yet — this segment's TTS fetch is still in
      // flight. Without this branch, pause() was a silent no-op here and
      // playback began unconditionally the moment the fetch resolved,
      // contradicting the just-pressed Pause action (RC5, Speech Engine audit).
      pauseRequestedRef.current = true;
      updatePlayState("paused");
    }
  }

  // Resume playback of the currently-paused segment — does NOT restart from segIdx 0.
  function resume() {
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
      updatePlayState("playing");
    } else if (providerRef.current === "browser" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.resume();
      updatePlayState("playing");
    } else if (pauseRequestedRef.current) {
      // Pause was requested while still loading and the response hasn't
      // arrived yet — clear the flag so fetchAndPlayAudio/playBrowserSpeech
      // play normally the instant it does, instead of staying silently
      // paused forever.
      pauseRequestedRef.current = false;
      updatePlayState("loading");
    }
  }

  function stop() {
    if (DEV) console.log("[SPEECH_STOP_USER]", { mode, segIdx, playState });
    // Reset starting guard so a Stop → Play within 400 ms isn't silently blocked (L1 fix).
    isStartingRef.current = false;
    stopAudio();
    resolveContinue();
    setSegIdx(0);
    setEyeText(null);
    setEyeRole(null);
    setEyeTier(null);
    setKaraokeWords([]);
    setActiveWordIdx(0);
    // Clear word-level sync so the PDF yellow word-box disappears on stop.
    // Evidence focus (thoughtUnitId in ReadingFocusStore) intentionally preserved.
    useReadingFocusStore.getState().clearWord();
    // P0 stabilization: without this, SmartPDFViewer's sentenceFocusRect (and
    // now the Eye Guide dim veil built from it) only cleared via its own
    // ~2.2s auto-clear timer — that timer is skipped entirely while
    // focusHighlightPersist is true, and this stop() call is what flips
    // playState (and therefore focusHighlightPersist, via onPlayStateChange
    // below) to false, so the still-set focusSnippet would otherwise sit
    // fully pinned for a stale beat before the timer even starts. Clearing
    // it explicitly here makes Stop clear the sentence focus/dim state
    // immediately, matching word-level clearWord() above.
    onSnippetFocus?.(null);
  }

  // ── "Read From Click" ───────────────────────────────────────────────────────
  // Switch to Current Page mode and start reading from the sentence the reader
  // clicked on in the PDF.
  function playFromSnippet(snippet: string) {
    const sents = fpSentences.length > 0 ? fpSentences : buildCurrentPageSpeechSegments(activePageText);
    if (!sents.length) return;
    const idx = findBestSentenceIndex(sents, snippet);
    if (DEV) console.log("[SPEECH_READ_FROM_CLICK]", { page: pageNumber, idx, total: sents.length, snippet: snippet.slice(0, 60), sentenceStart: sents[idx]?.slice(0, 120) ?? null });
    if (DEV) console.log("[CURRENT_PAGE_SPEECH_START]", { page: pageNumber, sentenceIndex: idx, wordIndex: 0, textPreview: sents[idx]?.slice(0, 120) ?? null });
    setOpen(true);
    setVisibleMode("currentPage");
    stop();
    // Reset the starting guard so the next play attempt isn't blocked by stop()'s
    // side-effects — stop() doesn't reset isStartingRef.current (H1 / L1 fix).
    isStartingRef.current = false;
    setSegIdx(idx);
    // Claim the speech controller so fetchAndPlayAudio's isSpeechStale() check
    // passes — without this the global token is stale after stop() and audio silently
    // returns "done" without playing (H1 fix).
    globalTokenRef.current = claimSpeech(SPEECH_OWNER);
    const session = beginSession();
    setTimeout(() => playFullPageSequential(sents, idx, session), 80);
  }

  // ── seekToCursor — prime resume refs from a PDF click cursor ─────────────────
  // Does NOT start playback. Current Page resolves directly against the ordered
  // source segments because the legacy semantic segment list is intentionally empty.
  function seekToCursor(cursor: ReadingCursor) {
    const anchor = cursor.canonicalAnchorId;
    const sourceSegments = fpSentences.length > 0
      ? fpSentences
      : buildCurrentPageSpeechSegments(activePageText);
    const resolvedIdx = cursor.sourceText
      ? findBestSentenceIndex(sourceSegments, cursor.sourceText)
      : 0;
    const strategy = cursor.sourceText ? "current-page-source-text" : "page-start";

    resumeAnchorIdRef.current   = anchor;
    resumeSourceTextRef.current = cursor.sourceText;
    resumeSegIdxRef.current     = resolvedIdx;
    resumeWordIndexRef.current  = cursor.sourceWordIndex;

    pendingSeekCursorRef.current = {
      segmentIndex:      resolvedIdx,
      canonicalAnchorId: anchor,
      sourceText:        cursor.sourceText,
      sourceWordIndex:   cursor.sourceWordIndex,
      sourceCharOffset:  cursor.sourceCharOffset,
    };

    // Open the panel if it's collapsed so the user can see the mode controls.
    setOpen(true);
    setVisibleMode("currentPage");
    if (DEV) console.log("[PDF_CLICK_CURSOR_PREPARED]", {
      mode,
      canonicalAnchorId: anchor,
      resolvedSegmentIndex: resolvedIdx,
      wordIndex: cursor.sourceWordIndex,
      charOffset: cursor.sourceCharOffset,
      strategy,
    });
    if (DEV) console.log("[SPEECH_SEEK_TO_CURSOR]", {
      mode,
      canonicalAnchorId: anchor,
      sourcePage: cursor.sourcePage,
      requestedWordIndex: cursor.sourceWordIndex,
      resolvedSegmentIndex: resolvedIdx,
      resolvedWordIndex: cursor.sourceWordIndex,
      strategy,
    });
  }

  // Start playback from the primed resume cursor — called by the Play chip after seekToCursor.
  function triggerPlay() {
    const resumeIdx = resumeSegIdxRef.current;
    resumeSegIdxRef.current = 0;
    if (visibleMode !== "currentPage") {
      setVisibleMode("currentPage");
      setTimeout(() => play(resumeIdx), 80);
      return;
    }
    play(resumeIdx);
  }

  // ── returnFromProfessor — called when Professor/Whiteboard closes ──────────
  // Restores Current Page speech to the position Professor was ACTUALLY
  // teaching from (the live grounded source unit, tracked throughout
  // Professor playback via the shared reading-focus store) rather than
  // wherever Current Page speech itself had reached before Professor opened,
  // and never leaves visibleMode stuck on the now-inactive Professor tab.
  // Reuses seekToCursor's existing resume machinery rather than a parallel
  // one — same contract (primes the resume cursor, does not auto-play).
  function returnFromProfessor(cursor: ReadingCursor | null) {
    if (cursor) {
      seekToCursor(cursor);
    } else {
      setVisibleMode("currentPage");
    }
  }

  useImperativeHandle(ref, () => ({ playFromSnippet, seekToCursor, triggerPlay, returnFromProfessor }), [fpSentences, activePageText, pageNumber, speed, voice, mode, segments, visibleMode]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const isPlaying  = playState === "playing";
  const isPaused   = playState === "paused";
  const isLoading  = playState === "loading";
  // A non-instructional page (cover/title/copyright/TOC/chapter-opener/
  // bibliography/etc.) has nothing worth reading or teaching, regardless of
  // how much raw text PDF.js extracted from it (a copyright page can easily
  // clear the 20-char floor below).
  const hasContent = !nonInstructionalPage && (segments.length > 0 || activePageText.length > 20);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={primary
      ? { borderRadius: 14, border: "1px solid rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.08)", overflow: "hidden" }
      : { borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
      <style>{`@keyframes eyePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(0.7)} }`}</style>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(o => {
          const next = !o;
          if (!next) stop(); // closing the panel must stop speech
          return next;
        })}
        style={primary
          ? { display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }
          : { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: primary ? 17 : 13 }}>{primary ? "▶" : "🎧"}</span>
        <span style={primary
          ? { fontSize: 13, fontWeight: 700, color: "#c7d2fe" }
          : { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#94a3b8", textTransform: "uppercase" }}>
          Speech
        </span>
        {isPlaying && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#a5b4fc", fontWeight: 600 }}>▶ Playing…</span>
        )}
        {isLoading && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#fbbf24", fontWeight: 600 }}>⟳ Loading…</span>
        )}
        {isPaused && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#fbbf24", fontWeight: 600 }}>⏸ Paused</span>
        )}
        <span style={{ marginLeft: (isPlaying || isLoading || isPaused) ? undefined : "auto", fontSize: 10, color: "#475569" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {VISIBLE_SPEECH_MODES.map(m => (
              <button key={m.id} type="button" onClick={() => {
                setVisibleMode(m.id);
              }} title={m.description}
                style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: visibleMode === m.id ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.07)", background: visibleMode === m.id ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)", color: visibleMode === m.id ? "#a5b4fc" : "#64748b", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
              >{m.label}</button>
            ))}
          </div>

          {nonInstructionalPage && (
            <div style={{ borderRadius: 8, border: "1px solid rgba(148,163,184,0.15)", background: "rgba(148,163,184,0.05)", padding: "8px 10px" }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 11, lineHeight: 1.5, fontStyle: "italic" }}>
                No instructional content to read or teach on this page.
              </p>
            </div>
          )}

          {visibleMode === "professor" ? (
            <div style={{ borderRadius: 10, border: "1px solid rgba(129,140,248,0.25)", background: "rgba(99,102,241,0.07)", padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
              <p style={{ margin: 0, color: "#cbd5e1", fontSize: 11, lineHeight: 1.55 }}>
                Professor follows the current page, explains each Thought Unit, and opens the Whiteboard only when a visual lesson materially helps.
              </p>
              <button
                type="button"
                onClick={() => { stopAudio(); onOpenProfessor?.(); }}
                disabled={!onOpenProfessor || nonInstructionalPage}
                style={{ alignSelf: "flex-start", padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.45)", background: "rgba(99,102,241,0.16)", color: "#c7d2fe", fontSize: 11, fontWeight: 700, cursor: (onOpenProfessor && !nonInstructionalPage) ? "pointer" : "not-allowed", opacity: (onOpenProfessor && !nonInstructionalPage) ? 1 : 0.45 }}
              >
                ▶ Start Professor
              </button>
            </div>
          ) : (
          <>
          {/* Controls row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isLoading ? (
              <button type="button" onClick={() => stop()}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)", color: "#fbbf24", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >⟳ Loading…</button>
            ) : isPlaying ? (
              <button type="button" onClick={pause}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)", color: "#fbbf24", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >⏸ Pause</button>
            ) : isPaused ? (
              <button type="button" onClick={resume}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.12)", color: "#a5b4fc", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >▶ Resume</button>
            ) : (
              <button type="button" disabled={!hasContent} onClick={() => {
                // Priority: resume anchor from mode-switch → focused anchor → start.
                const resumeIdx = resumeSegIdxRef.current;
                if (resumeIdx > 0) {
                  resumeSegIdxRef.current = 0; // consume so next press starts fresh
                  play(resumeIdx);
                } else if (selectedUnitId && segments.length > 0) {
                  const idx = segments.findIndex(
                    (s) => s.evidenceRefId === selectedUnitId || s.id === selectedUnitId
                  );
                  play(idx >= 0 ? idx : 0);
                } else {
                  play(0);
                }
              }}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.4)", background: hasContent ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)", color: hasContent ? "#a5b4fc" : "#475569", fontSize: 12, fontWeight: 700, cursor: hasContent ? "pointer" : "not-allowed" }}
              >▶ Play</button>
            )}
            <button type="button" onClick={() => stop()}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >■ Stop</button>
            {/* Reading bar is display-only — word sync (onActiveWordChange → PDF/LeftPanel/ExpertBrain) fires unconditionally from the audio engine regardless of this toggle */}
            <button type="button" onClick={() => setShowKaraokeBar(b => !b)}
              title={showKaraokeBar ? "Hide reading bar (word sync continues in PDF + LeftPanel)" : "Show reading bar"}
              style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${showKaraokeBar ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)"}`, background: showKaraokeBar ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)", color: showKaraokeBar ? "#a5b4fc" : "#64748b", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
            >Reading Bar</button>
            <button type="button"
              onClick={() => { const prev = Math.max(0, segIdx - 1); setSegIdx(prev); stop(); setTimeout(() => play(prev), 80); }}
              disabled={segIdx <= 0}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: segIdx <= 0 ? 0.4 : 1 }}
            >◀</button>
            <button type="button"
              onClick={() => { const next = segIdx + 1; if (mode === "fullPage" ? next < fpSentences.length : next < segments.length) { setSegIdx(next); stop(); setTimeout(() => play(next), 80); } }}
              disabled={mode === "fullPage" ? segIdx >= fpSentences.length - 1 : segIdx >= segments.length - 1}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: (mode === "fullPage" ? segIdx >= fpSentences.length - 1 : segIdx >= segments.length - 1) ? 0.4 : 1 }}
            >▶</button>

            {/* Speed */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}>
              <span style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap" }}>{speed.toFixed(1)}×</span>
              <input type="range" min={0.5} max={2.5} step={0.1} value={speed}
                onChange={e => {
                  const v = Number(e.target.value);
                  speedRef.current = v;   // update ref before any restart
                  setSpeed(v);
                  if (audioRef.current) audioRef.current.playbackRate = v;
                  // Browser SpeechSynthesis rate can't be changed mid-utterance —
                  // cancel and restart from the current segment with the new rate.
                  if (
                    providerRef.current === "browser" &&
                    typeof window !== "undefined" &&
                    window.speechSynthesis?.speaking
                  ) {
                    playRef.current(segIdxRef.current);
                  }
                }}
                style={{ width: 60, accentColor: "#818cf8" }} title="Playback speed" />
            </div>
          </div>

          {/* Voice selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#475569", flexShrink: 0 }}>Voice:</span>
            <select value={voice} onChange={e => setVoice(e.target.value as OAIVoice)}
              style={{ flex: 1, fontSize: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#94a3b8", padding: "3px 6px", cursor: "pointer" }}
            >
              {OPENAI_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Error */}
          {errorMsg && (
            <p style={{ fontSize: 11, color: "#fca5a5", margin: 0 }}>⚠ {errorMsg}</p>
          )}

          {/* Eye Guide — shows the sentence currently being read */}
          {(isPlaying || isLoading || isPaused) && eyeText && (() => {
            const ec = eyeRole ? (ROLE_COLOR[eyeRole] ?? ROLE_COLOR.thesis) : ROLE_COLOR.thesis;
            return (
              <div style={{ borderRadius: 8, border: `1px solid ${ec.border}`, background: ec.bg, padding: "7px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: ec.text, boxShadow: `0 0 6px ${ec.text}`, animation: "eyePulse 1.2s ease-in-out infinite" }} />
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: ec.text, textTransform: "uppercase" }}>
                    {eyeRole === "fullPage" ? "Current Page" : eyeRole === "visualAnchor" ? "Reading" : eyeRole ?? "Reading"}
                  </span>
                  {eyeTier && (
                    <span style={{ fontSize: 9, color: ec.text, letterSpacing: "-0.02em" }} title={`${eyeTier.label} priority`} data-testid="speech-eye-tier-stars">
                      {renderStars(eyeTier.stars)}
                    </span>
                  )}
                </div>
                {karaokeWords.length > 0 ? (
                  <p
                    ref={karaokeBoxRef}
                    style={{ margin: 0, fontSize: 11, color: "#cbd5e1", lineHeight: 1.6, maxHeight: 56, overflowY: "auto" }}
                  >
                    {karaokeWords.map((w, i) => (
                      <span
                        key={i}
                        ref={i === activeWordIdx ? activeWordRef : undefined}
                        style={
                          i === activeWordIdx
                            ? { background: ec.text, color: "#0f172a", borderRadius: 3, padding: "0 2px", fontWeight: 600 }
                            : undefined
                        }
                      >
                        {w.word}{" "}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 11, color: "#cbd5e1", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const }}>
                    {eyeText}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Guided teach-loop checkpoint — playback is stopped, waiting for the
              reader to continue (or explain first, then continue). */}
          {awaitingContinue && (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={resolveContinue}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.15)", color: "#a5b4fc", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                ▶ Continue
              </button>
              {segments[segIdx]?.evidenceRefId && (
                <button
                  type="button"
                  onClick={() => explainCurrentSegment(segments[segIdx].evidenceRefId as string)}
                  style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#cbd5e1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  💬 Explain
                </button>
              )}
            </div>
          )}

          {/* Segment list */}
          {segments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 200, overflowY: "auto" }}>
              {segments.map((seg, i) => {
                const s = roleStyle(seg.role);
                const isActive = i === segIdx;
                return (
                  <button key={seg.id} type="button"
                    onClick={() => { setSegIdx(i); stop(); setTimeout(() => play(i), 80); }}
                    style={{ display: "flex", alignItems: "flex-start", gap: 7, textAlign: "left", background: isActive ? s.bg : "transparent", border: isActive ? `1px solid ${s.border}` : "1px solid transparent", borderRadius: 7, padding: "4px 7px", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", color: s.text, textTransform: "uppercase", paddingTop: 1, flexShrink: 0, minWidth: 52 }}>
                      {isActive && isPlaying ? "▶ " : ""}{seg.label}
                    </span>
                    {seg.tier && (
                      <span
                        style={{ fontSize: 8, color: s.text, letterSpacing: "-0.02em", flexShrink: 0, paddingTop: 1 }}
                        title={`${seg.tier.label} priority`}
                        data-testid="speech-importance-stars"
                      >
                        {renderStars(seg.tier.stars)}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: isActive ? "#e2e8f0" : "#64748b", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                      {seg.rawText}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Current Page mode progress + Read From Click hint */}
          {mode === "fullPage" && fpSentences.length > 0 && (
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>
              {isPlaying || isLoading || isPaused
                ? `Sentence ${segIdx + 1} of ${fpSentences.length}`
                : `${fpSentences.length} sentences · click ▶ Play, or click any sentence in the PDF to start there`}
            </p>
          )}
          {mode !== "fullPage" && fpSentences.length > 0 && !isPlaying && !isLoading && (
            <p style={{ fontSize: 10, color: "#475569", margin: 0 }}>
              👆 Click any sentence in the PDF to read from there.
            </p>
          )}

          {segments.length === 0 && mode !== "fullPage" && thoughtUnits.length === 0 && (
            <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>Preparing expert reading map…</p>
          )}
          </>
          )}
        </div>
      )}

      {/* NaturalReader-style bottom karaoke bar — fixed to the viewport bottom */}
      {showKaraokeBar && (isPlaying || isPaused) && eyeText && (() => {
        const ec = eyeRole ? (ROLE_COLOR[eyeRole] ?? ROLE_COLOR.thesis) : ROLE_COLOR.thesis;
        return (
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
            background: "rgba(10,15,28,0.97)", backdropFilter: "blur(14px) saturate(1.2)",
            borderTop: `2px solid ${ec.border}`,
            padding: "10px 20px 14px",
            display: "flex", alignItems: "center", gap: 14,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
              color: ec.text, textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0,
            }}>
              {eyeRole === "fullPage" ? "READING" : (eyeRole?.toUpperCase() ?? "READING")}
            </span>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, flex: 1, overflowX: "auto", whiteSpace: "nowrap" }}>
              {karaokeWords.length > 0
                ? karaokeWords.map((w, i) => (
                    <span key={i} style={
                      i === activeWordIdx
                        ? { background: ec.text, color: "#0f172a", borderRadius: 4, padding: "2px 4px", fontWeight: 700, fontSize: 16 }
                        : { color: i < activeWordIdx ? "#475569" : "#e2e8f0" }
                    }>
                      {w.word}{" "}
                    </span>
                  ))
                : <span style={{ color: "#94a3b8" }}>{eyeText}</span>
              }
            </p>
            <button type="button" onClick={() => setShowKaraokeBar(false)}
              style={{ flexShrink: 0, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#475569", fontSize: 12, cursor: "pointer", lineHeight: 1 }}
              title="Hide karaoke bar"
            >✕</button>
          </div>
        );
      })()}
    </div>
  );
});

export default React.memo(StudySpeechPanel);
