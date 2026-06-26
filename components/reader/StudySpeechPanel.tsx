// components/reader/StudySpeechPanel.tsx
// Study Speech — reads PageBrain aloud.
// Primary: OpenAI TTS via /api/tts (server-side, key never exposed).
// Fallback: browser speechSynthesis.

"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import {
  buildSpeechScript,
  STUDY_SPEECH_MODES,
  formulaToSpeech,
  type StudySpeechMode,
  type SpeechSegment,
} from "@/lib/speech/studySpeechEngine";
import { normalizeFormulasForSpeech } from "@/lib/speech/formulaNormalization";
import { normalizeDropCaps } from "@/lib/insights/cleanActivePageText";
import { renderStars } from "@/lib/insights/importanceTiers";
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

const SPEECH_OWNER = "study-speech" as const;

// ── Header / footer / caption detector ───────────────────────────────────────
// Returns true for text blocks that should be skipped by the eye guide:
// page numbers, running headers, footers, figure captions, section titles.
function isHeaderOrFooter(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return true;
  if (/^\d+$/.test(t)) return true;                                     // bare page number
  if (/^(page|pg\.?)\s*\d+$/i.test(t)) return true;                   // "Page 12"
  if (/^(figure|fig\.|table|appendix)\s*[\d.]+/i.test(t)) return true; // "Figure 2.3"
  if (/^(chapter|unit|section|module)\s*[\d.]+/i.test(t)) return true; // "Chapter 4"
  if (t === t.toUpperCase() && t.length < 80 && /[A-Z]/.test(t)) return true; // ALL CAPS heading
  if (/copyright|all rights reserved|cengage|pearson|mcgraw|elsevier|wiley|isbn/i.test(t)) return true;
  return false;
}

// ── Sentence splitter ────────────────────────────────────────────────────────
const ABBREV_RE = /\b(Fig|No|vol|pp|cf|e\.g|i\.e|vs|Dr|Mr|Mrs|Ms|Prof|et\s+al|etc|approx|dept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|St|Avg|avg|max|min)\.\s*$/i;

function splitIntoSentences(text: string): string[] {
  if (!text.trim()) return [];
  const raw = text.split(/(?<=[.!?])\s+/);
  const merged: string[] = [];
  for (const fragment of raw) {
    const trimmed = fragment.trim();
    if (!trimmed) continue;
    const prev = merged[merged.length - 1];
    if (prev && (ABBREV_RE.test(prev) || /^[a-z"''']/.test(trimmed))) {
      merged[merged.length - 1] = prev + " " + trimmed;
    } else {
      merged.push(trimmed);
    }
  }
  return merged.filter(s => s.length >= 15);
}

// ── Quick page-text → sentence splitter (used by Current Page mode + Read From Click) ──
const QUICK_ABBREV_RE = /\b(Fig|No|vol|pp|cf|e\.g|i\.e|vs|Dr|Mr|Mrs|Ms|Prof|et\s+al|etc|approx|dept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.\s*$/i;

function buildQuickSentences(activePageText: string): string[] {
  if (!activePageText) return [];
  const pipeStripped = activePageText.replace(/\s*\|\s*/g, " ");
  const rawLines = pipeStripped.split("\n").map(l => l.trim()).filter(Boolean);
  const bodyLines = rawLines.filter(line => !isHeaderOrFooter(line));
  const quickCleaned = normalizeDropCaps(bodyLines.join(" "));

  const rawChunks = quickCleaned.split(/(?<=[.!?…])\s+/);
  const merged: string[] = [];
  for (const chunk of rawChunks) {
    const t = chunk.trim();
    if (!t) continue;
    const isLowercaseContinuation = merged.length > 0 && /^[a-z"'(0-9]/.test(t) && !QUICK_ABBREV_RE.test(merged[merged.length - 1]);
    if (isLowercaseContinuation) {
      merged[merged.length - 1] += " " + t;
    } else {
      merged.push(t);
    }
  }
  const withHeadings: string[] = [];
  for (let i = 0; i < merged.length; i++) {
    const s = merged[i];
    const isShortHeading = s.length < 30 && !/[!?]$/.test(s);
    if (isShortHeading && i + 1 < merged.length) {
      merged[i + 1] = s + " " + merged[i + 1];
    } else {
      withHeadings.push(s);
    }
  }
  return withHeadings.filter((s) => s.length >= 10);
}

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

// ── Role colour map ──────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, { border: string; text: string; bg: string }> = {
  thesis:          { border: "rgba(251,191,36,0.35)",  text: "#fbbf24", bg: "rgba(251,191,36,0.07)" },
  whyThisMatters:  { border: "rgba(52,211,153,0.30)",  text: "#34d399", bg: "rgba(52,211,153,0.05)" },
  keyMechanism:    { border: "rgba(99,102,241,0.35)",  text: "#818cf8", bg: "rgba(99,102,241,0.07)" },
  commonConfusion: { border: "rgba(239,68,68,0.35)",   text: "#fca5a5", bg: "rgba(239,68,68,0.07)"  },
  examSignal:      { border: "rgba(251,146,60,0.35)",  text: "#fb923c", bg: "rgba(251,146,60,0.07)" },
  conceptBlock:    { border: "rgba(147,197,253,0.30)", text: "#93c5fd", bg: "rgba(147,197,253,0.05)"},
  visualAnchor:    { border: "rgba(167,243,208,0.30)", text: "#6ee7b7", bg: "rgba(167,243,208,0.05)"},
  reasoningFlow:   { border: "rgba(216,180,254,0.30)", text: "#d8b4fe", bg: "rgba(216,180,254,0.05)"},
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
  activePageText?: string;
  /** Effective domain preset id — same value LeftPanel (PureReaderView) is grouping/ordering
   *  its thought units by, so Guided mode's groupThoughtUnits() call agrees with it exactly. */
  presetId?: string;
  /** Called when a speech segment with evidenceRefId starts playing — drives PDF focus */
  onEvidenceFocus?: (id: string | null) => void;
  /** Called in Full Page mode with the current sentence text — drives focusSnippet scroll */
  onSnippetFocus?: (snippet: string | null) => void;
  /** Fires whenever active read-aloud playback starts/stops — drives the persistent
   *  reading highlight in the PDF (focusHighlightPersist). */
  onPlayStateChange?: (isReading: boolean) => void;
  /** Render as the promoted primary Study Tools action ("▶ Listen to this page"),
   *  open by default, instead of the compact collapsed header. */
  primary?: boolean;
}

export interface StudySpeechPanelHandle {
  /** "Read From Click" — switch to Current Page mode and start reading from the
   *  sentence that best matches the clicked PDF text. */
  playFromSnippet: (snippet: string) => void;
}

// ── Main component ───────────────────────────────────────────────────────────

const StudySpeechPanel = forwardRef<StudySpeechPanelHandle, Props>(function StudySpeechPanel(
  { studyModel, pageNumber, bookId, activePageText = "", presetId = "universal", onEvidenceFocus, onSnippetFocus, onPlayStateChange, primary = false },
  ref,
) {
  const [open, setOpen]       = useState(primary);
  const [mode, setMode]       = useState<StudySpeechMode>("study");
  const [voice, setVoice]     = useState<OAIVoice>("alloy");
  const [speed, setSpeed]     = useState(1.0);
  const [segments, setSegments] = useState<SpeechSegment[]>([]);
  const [segIdx, setSegIdx]   = useState(0);

  type PlayState = "idle" | "loading" | "playing" | "paused" | "error";
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  // Eye Guide: tracks the snippet currently being spoken
  const [eyeText, setEyeText]   = useState<string | null>(null);
  const [eyeRole, setEyeRole]   = useState<string | null>(null);
  // Guided mode only: star tier of the segment currently being spoken
  const [eyeTier, setEyeTier]   = useState<{ stars: number; label: string } | null>(null);

  // Active audio element ref — so we can stop/pause
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  // Tracks which provider is currently playing — suppresses false browser errors
  const providerRef = useRef<"openai" | "browser" | null>(null);
  // Abort flag for sequential highlights playback
  const abortRef   = useRef(false);
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

  // TTS prefetch cache — keyed by the exact text sent to /api/tts. Lets the next
  // segment's audio start fetching while the current segment is still playing.
  const audioCacheRef = useRef<Map<string, Promise<{ blob: Blob; mimeType: string } | "browser">>>(new Map());

  // Reset on book change — new book means new context entirely.
  useEffect(() => {
    setSegIdx(0);
    setEyeText(null);
    setEyeRole(null);
    setEyeTier(null);
    stopAudio();
    console.log("[EYE_GUIDE_RESET]", { bookId, reason: "book-change" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // Reset on page navigation — stops audio and clears eye guide.
  useEffect(() => {
    setSegIdx(0);
    setEyeText(null);
    setEyeRole(null);
    setEyeTier(null);
    stopAudio();
    console.log("[EYE_GUIDE_RESET]", { page: pageNumber, reason: "page-change" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  // Reset on mode switch so playback always starts at the first segment of the new mode.
  useEffect(() => {
    setSegIdx(0);
    setEyeText(null);
    setEyeRole(null);
    setEyeTier(null);
    console.log("[EYE_GUIDE_RESET]", { page: pageNumber, mode, reason: "mode-change" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Page sentences — built whenever activePageText changes, regardless of mode, so
  // "Read From Click" can jump into Current Page playback from any mode.
  const [fpSentences, setFpSentences] = useState<string[]>([]);
  useEffect(() => {
    if (activePageText) {
      console.log("[SPEECH_RAW_TEXT]", {
        page:     pageNumber,
        chars:    activePageText.length,
        first200: activePageText.slice(0, 200),
        source:   "activePageText prop",
      });

      // ── Step 1: quick clean — strip pipes, drop-caps, filter headers ─────
      const ABBREV_RE = /\b(Fig|No|vol|pp|cf|e\.g|i\.e|vs|Dr|Mr|Ms|Prof|et\s+al|etc|approx|dept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.\s*$/i;

      // Remove pipe characters used as column/header separators in OCR
      const pipeStripped = activePageText.replace(/\s*\|\s*/g, " ");

      const rawLines = pipeStripped.split("\n").map(l => l.trim()).filter(Boolean);
      const bodyLines: string[] = [];
      let removedHeaders = 0;
      for (const line of rawLines) {
        if (isHeaderOrFooter(line)) {
          console.log("[SPEECH_HEADER_REMOVED]", { page: pageNumber, text: line.slice(0, 80) });
          removedHeaders++;
        } else {
          bodyLines.push(line);
        }
      }
      const quickCleaned = normalizeDropCaps(bodyLines.join(" "));

      const rawChunks = quickCleaned.split(/(?<=[.!?…])\s+/);
      const merged: string[] = [];
      for (const chunk of rawChunks) {
        const t = chunk.trim();
        if (!t) continue;
        const isLowercaseContinuation = merged.length > 0 && /^[a-z"'(0-9]/.test(t) && !ABBREV_RE.test(merged[merged.length - 1]);
        if (isLowercaseContinuation) {
          merged[merged.length - 1] += " " + t;
        } else {
          merged.push(t);
        }
      }
      const withHeadings: string[] = [];
      for (let i = 0; i < merged.length; i++) {
        const s = merged[i];
        const isShortHeading = s.length < 30 && !/[!?]$/.test(s);
        if (isShortHeading && i + 1 < merged.length) {
          merged[i + 1] = s + " " + merged[i + 1];
        } else {
          withHeadings.push(s);
        }
      }
      const quickSents = withHeadings.filter((s) => s.length >= 10);
      const firstBodyIdx = quickSents.findIndex(s => !isHeaderOrFooter(s));

      console.log("[SPEECH_CLEANED_TEXT]", {
        page:           pageNumber,
        removedHeaders,
        chars:          quickCleaned.length,
        first200:       quickCleaned.slice(0, 200),
      });
      console.log("[SPEECH_SENTENCE_COUNT]", {
        page:         pageNumber,
        count:        quickSents.length,
        firstBodyIdx,
        firstBody:    firstBodyIdx >= 0 ? quickSents[firstBodyIdx].slice(0, 80) : null,
        first4:       quickSents.slice(0, 4).map(s => s.slice(0, 60)),
      });
      console.log("[SPEECH_FULL_PAGE_STATE]", {
        page:           pageNumber,
        mode,
        rawChars:       activePageText.length,
        rawFirst80:     activePageText.slice(0, 80),
        totalSentences: quickSents.length,
        firstSentence:  quickSents[0]?.slice(0, 80) ?? null,
        firstBodyIdx,
        firstBodyText:  firstBodyIdx >= 0 ? quickSents[firstBodyIdx].slice(0, 80) : null,
        sentences1to4:  quickSents.slice(0, 4).map(s => s.slice(0, 60)),
      });
      console.log("[OCR_TEXT_PREVIEW]", {
        page:     pageNumber,
        first500: activePageText.slice(0, 500),
        source:   "activePageText prop from index.tsx pageTextByPage",
      });
      console.log("[EYE_GUIDE_TEXT_BLOCKS]", {
        page:   pageNumber,
        blocks: quickSents.slice(0, 8).map((s, i) => ({
          idx:       i,
          isSkipped: isHeaderOrFooter(s),
          text:      s.slice(0, 80),
        })),
      });
      console.log("[EYE_GUIDE_SORTED_BLOCKS]", {
        page:         pageNumber,
        total:        quickSents.length,
        firstBodyIdx,
        firstBody:    firstBodyIdx >= 0 ? quickSents[firstBodyIdx].slice(0, 80) : null,
        source:       "activePageText-top-to-bottom",
      });
      console.log("[SPEECH_FULL_PAGE_SENTENCES]", { count: quickSents.length, first: quickSents[0]?.slice(0, 80) });

      // Set immediately with quick-cleaned result so playback can start
      setFpSentences(quickSents);
      console.log("[SPEECH_CONTEXT_READY]", { page: pageNumber, sentenceCount: quickSents.length });

      // ── Step 2: background OCR repair if corruption is detected ──────────
      // Score = ratio of suspiciously short all-caps tokens (not common words)
      const COMMON = new Set(["A", "I", "AN", "OF", "IN", "IS", "TO", "THE", "AND", "OR", "FOR", "ON", "AT", "BY", "BE"]);
      const allTokens = quickCleaned.split(/\s+/);
      const suspiciousTokens = allTokens.filter(tok => {
        const t = tok.replace(/[^A-Za-z]/g, "");
        return t.length >= 2 && t.length <= 4 && t === t.toUpperCase() && !COMMON.has(t);
      });
      const corruptionScore = allTokens.length > 0 ? suspiciousTokens.length / allTokens.length : 0;
      console.log("[SPEECH_OCR_REPAIR]", {
        page:             pageNumber,
        corruptionScore:  Math.round(corruptionScore * 1000) / 1000,
        suspiciousTokens: suspiciousTokens.slice(0, 10),
        willRepair:       corruptionScore > 0.08,
      });

      if (corruptionScore > 0.08 && mode === "fullPage") {
        const textToRepair = quickSents.join(" ").slice(0, 3000);
        fetch("/api/speech-preprocess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToRepair }),
        })
          .then(r => r.json())
          .then((data: { cleaned: string; wasRepaired: boolean }) => {
            if (!data.wasRepaired || !data.cleaned) return;
            console.log("[SPEECH_OCR_REPAIR]", {
              page:        pageNumber,
              wasRepaired: true,
              before:      textToRepair.slice(0, 100),
              after:       data.cleaned.slice(0, 100),
            });
            // Re-split the AI-cleaned text into sentences
            const reChunks = data.cleaned.split(/(?<=[.!?])\s+/);
            const reMerged: string[] = [];
            for (const chunk of reChunks) {
              const t = chunk.trim();
              if (!t) continue;
              const isCont = reMerged.length > 0 && /^[a-z"'(0-9]/.test(t) && !ABBREV_RE.test(reMerged[reMerged.length - 1]);
              if (isCont) reMerged[reMerged.length - 1] += " " + t;
              else reMerged.push(t);
            }
            const repairedSents = reMerged.filter(s => s.length >= 10);
            if (repairedSents.length > 0) {
              console.log("[SPEECH_SENTENCE_COUNT]", {
                page:        pageNumber,
                source:      "ai-repaired",
                count:       repairedSents.length,
                firstRepaired: repairedSents[0]?.slice(0, 80) ?? null,
              });
              setFpSentences(repairedSents);
            }
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.warn("[SPEECH_OCR_REPAIR]", { page: pageNumber, error: message });
          });
      }
    } else {
      setFpSentences([]);
    }
  }, [mode, activePageText, pageNumber]);

  // Rebuild segments when model or mode changes — without stopping audio.
  useEffect(() => {
    if (mode === "fullPage" || !studyModel) {
      // fullPage reads sentences directly, no pre-built segments needed.
      // Other modes with no studyModel yet (RightPanel/OpenAI synthesis still
      // running) also have nothing to build from — play() falls back to page text.
      setSegments([]);
      return;
    }
    const next = buildSpeechScript(studyModel, mode, presetId);
    setSegments(next);
  }, [studyModel, mode, pageNumber, presetId]);

  // ── Audio helpers ──────────────────────────────────────────────────────────

  function stopAudio() {
    if (providerRef.current) {
      console.log("[SPEECH_CANCEL_PREVIOUS]", { provider: providerRef.current, mode, segIdx });
    }
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
    setPlayState("idle");
    setEyeText(null);
    setEyeRole(null);
    setEyeTier(null);
    onPlayStateChange?.(false);
    // Only release the shared controller's active slot if WE currently hold
    // it — never force-stop a different component's speech from here.
    if (globalTokenRef.current && !isSpeechStale(globalTokenRef.current)) {
      notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
    }
  }

  useEffect(() => () => stopAudio(), []);

  // ── TTS fetch helper — returns Promise<"done" | "browser"> ─────────────────

  // Fetches (and caches) the TTS audio for `text` without playing it. Repeated
  // calls with the same text + voice reuse the in-flight/completed request, so
  // prefetching the next segment ahead of time is just a fire-and-forget call.
  function fetchTTS(text: string): Promise<{ blob: Blob; mimeType: string } | "browser"> {
    const cacheKey = `${voice}::${text}`;
    const cached = audioCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const promise = (async (): Promise<{ blob: Blob; mimeType: string } | "browser"> => {
      // Hard timeout — a hung /api/tts request must never leave playback stuck
      // on "Loading…" forever. Abort and let the caller fall back to browser speech.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      let res: Response;
      try {
        res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ script: text, voice, format: "mp3", return: "json" }),
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
        console.log("[OPENAI_SPEECH_DONE]", { provider: data.provider ?? "openai", bytes: data.audioBase64.length });
        const bytes = Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0));
        const blob  = new Blob([bytes], { type: data.mimeType || "audio/mpeg" });
        return { blob, mimeType: data.mimeType || "audio/mpeg" };
      }

      if (data.useBrowserSpeech) {
        console.log("[SPEECH_FALLBACK_USED]", { provider: "browser", reason: data.fallbackReason ?? "openai-unavailable" });
        return "browser";
      }

      throw new Error("Unexpected TTS response");
    })();

    audioCacheRef.current.set(cacheKey, promise);
    promise.catch(() => audioCacheRef.current.delete(cacheKey)); // don't cache failures
    return promise;
  }

  // Kicks off a TTS fetch for the upcoming segment so it's ready by the time
  // playback reaches it. Safe to call with empty/undefined text.
  function prefetchTTS(text: string | undefined | null) {
    if (!text) return;
    fetchTTS(text).catch(() => {}); // errors surface (again) when actually played
  }

  async function fetchAndPlayAudio(text: string, session: number): Promise<"done" | "browser"> {
    const cacheKey = `${voice}::${text}`;
    const result = await fetchTTS(text);
    audioCacheRef.current.delete(cacheKey); // one-shot — don't replay stale audio on reuse

    // A newer play() call superseded this request while the fetch was in
    // flight — do NOT touch audioRef/providerRef or start playback, or we'd
    // create a second, simultaneous voice on top of the newer session's audio.
    // Checked against both the local session counter (this component's own
    // supersession) and the shared controller's token (another component may
    // have claimed speech while this fetch was in flight).
    if (isStale(session) || isSpeechStale(globalTokenRef.current)) return "done";

    if (result === "browser") return "browser";

    const { blob, mimeType } = result;
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    const audio = new Audio(url);
    audio.playbackRate = speed;
    audioRef.current   = audio;
    providerRef.current = "openai";
    const token = globalTokenRef.current;
    registerActiveAudio(token, audio, () => stopAudio());
    return new Promise((resolve, reject) => {
      audio.onplay  = () => { notifySpeechStart(token, SPEECH_OWNER); console.log("[SPEECH_UTTERANCE_START]", { source: "openai", mode }); console.log("[SPEECH_AUDIO_PLAY]", { mode }); setPlayState("playing"); };
      // Do NOT notifySpeechEnd here — a multi-segment session (Study/Full/Focus/
      // Highlights modes) claims one token for the whole sequence and reuses it
      // across segments via registerActiveAudio. Releasing it after the first
      // segment would make every later fetchAndPlayAudio() call see its own
      // token as stale and silently skip playback. notifySpeechEnd is called
      // once when the whole sequence actually finishes (or is stopped).
      audio.onended = () => { console.log("[SPEECH_UTTERANCE_END]", { source: "openai", mode }); console.log("[SPEECH_AUDIO_END]", { mode }); URL.revokeObjectURL(url); blobUrlRef.current = null; resolve("done"); };
      audio.onerror = () => {
        // stopAudio() clears src which fires onerror — treat as clean stop, not failure
        if (abortRef.current || isStale(session) || isSpeechStale(token)) { resolve("done"); return; }
        notifySpeechError(token, SPEECH_OWNER, "openai-audio-playback-failed");
        console.warn("[SPEECH_ERROR]", { source: "openai-audio", mode });
        reject(new Error("Audio playback failed"));
      };
      audio.play().catch((e) => { if (abortRef.current || isStale(session) || isSpeechStale(token)) resolve("done"); else reject(e); });
    });
  }

  // ── Browser speech fallback ─────────────────────────────────────────────────

  function playBrowserSpeech(text: string, onDone?: () => void, session?: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlayState("error");
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
    // Normalize for browser TTS: replace period-space with comma-space to shorten
    // inter-sentence pauses (browser SpeechSynthesis adds ~800ms at each period).
    const normalized = text
      .replace(/\.\s+/g, ", ")
      .replace(/[!?]\s+/g, ", ")
      .replace(/,\s*,/g, ",")
      .trim();
    const utt = new SpeechSynthesisUtterance(normalized);
    utt.rate  = Math.min(speed * 1.05, 1.8); // slight boost since pauses are reduced
    const token = globalTokenRef.current;
    registerActiveUtterance(token, utt, () => stopAudio());

    const superseded = () => (session !== undefined && isStale(session)) || isSpeechStale(token);

    // Watchdog: if onend never fires (stalled synthesis engine), cancel and continue.
    const timeoutMs = Math.min(60000, Math.max(15000, normalized.length * 45));
    let watchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      console.warn("[SPEECH_WATCHDOG]", { source: "browser", charCount: normalized.length, timeoutMs });
      window.speechSynthesis.cancel();
      if (!superseded()) setPlayState("idle");
      onDone?.();
    }, timeoutMs);
    const clearWatchdog = () => { if (watchdog) { clearTimeout(watchdog); watchdog = null; } };

    utt.onstart = () => { notifySpeechStart(token, SPEECH_OWNER); console.log("[SPEECH_UTTERANCE_START]", { source: "browser", charCount: normalized.length }); console.log("[SPEECH_AUDIO_PLAY]", { source: "browser", charCount: normalized.length }); if (!superseded()) setPlayState("playing"); };
    // See the comment on fetchAndPlayAudio's audio.onended — same reasoning:
    // don't release the shared session token after just one segment.
    utt.onend   = () => { clearWatchdog(); console.log("[SPEECH_UTTERANCE_END]", { source: "browser" }); console.log("[SPEECH_AUDIO_END]", { source: "browser" }); if (!superseded()) setPlayState("idle"); onDone?.(); };
    utt.onerror = (e) => {
      clearWatchdog();
      // "canceled"/"interrupted" = intentional stop — resolve so the play loop can exit cleanly.
      if (e.error === "canceled" || e.error === "interrupted") { onDone?.(); return; }
      if (providerRef.current !== "browser") { onDone?.(); return; } // OpenAI took over
      if (superseded()) { onDone?.(); return; }
      notifySpeechError(token, SPEECH_OWNER, e.error);
      console.warn("[SPEECH_ERROR]", { source: "browser", error: e.error });
      setPlayState("error");
      setErrorMsg("Speech is temporarily unavailable. Please try again.");
      onDone?.();
    };
    // Belt-and-suspenders: the shared controller already force-cancels any
    // previous speech synthesis on claimSpeech(), but cancel() again here in
    // case this call came from a path that didn't go through claimSpeech.
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  }

  // ── Full Page: sentence-by-sentence playback ──────────────────────────────

  async function playFullPageSequential(sentences: string[], fromIdx: number, session: number) {
    setPlayState("loading");
    onPlayStateChange?.(true);

    // [DIAGNOSIS] State at play start — reveals stale segIdx and sentence zero issue
    console.log("[EYE_GUIDE_START_INDEX]", {
      page:         pageNumber,
      mode,
      fromIdx,
      segIdx,                                          // current state — if >0, stale from prev page
      totalSentences: sentences.length,
      sentence0:    sentences[0]?.slice(0, 80) ?? null,
      sentence1:    sentences[1]?.slice(0, 80) ?? null,
      sentence3:    sentences[3]?.slice(0, 80) ?? null, // sentence "4" (0-indexed 3)
      isHeaderAt0:  sentences[0] ? isHeaderOrFooter(sentences[0]) : null,
      isHeaderAt1:  sentences[1] ? isHeaderOrFooter(sentences[1]) : null,
      isHeaderAt2:  sentences[2] ? isHeaderOrFooter(sentences[2]) : null,
    });

    // Sentences are already pre-filtered in the fpSentences builder (isHeaderOrFooter per line).
    // Start from fromIdx directly — no secondary skip loop that would push index to "sentence 4".
    const effectiveFromIdx = fromIdx;
    console.log("[EYE_GUIDE_START_BLOCK]", { idx: effectiveFromIdx, text: sentences[effectiveFromIdx]?.slice(0, 80) ?? null, page: pageNumber });

    for (let i = effectiveFromIdx; i < sentences.length; i++) {
      if (isStale(session)) break;
      if (i === effectiveFromIdx) console.log("[SPEECH_PLAY_START]", { mode: "fullPage", fromIdx, totalSentences: sentences.length, page: pageNumber, first: sentences[i]?.slice(0, 80) });
      const raw = sentences[i];
      const { hasMath, hasScience, transformations } = normalizeFormulasForSpeech(raw);
      if (transformations > 0) console.log("[SPEECH_FORMULA_NORMALIZATION]", { segIdx: i, transformations, hasMath, hasScience });
      if (hasMath)    console.log("[SPEECH_MATH_DETECTED]",    { segIdx: i, preview: raw.slice(0, 60) });
      if (hasScience) console.log("[SPEECH_SCIENCE_DETECTED]", { segIdx: i, preview: raw.slice(0, 60) });
      const text = computeSpeechText(raw);
      console.log("[SPEECH_TEXT_READY]", { segIdx: i, mode: "fullPage", charCount: text.length });
      console.log("[SPEECH_TTS_TEXT_READY]", { segIdx: i, charCount: text.length, preview: text.slice(0, 60) });
      console.log("[SPEECH_FINAL_TTS_TEXT]", { segIdx: i, page: pageNumber, text: text.slice(0, 200) });
      setSegIdx(i);
      setEyeText(text.slice(0, 160));
      setEyeRole("fullPage");
      setEyeTier(null);

      console.log("[SPEECH_SEGMENT_START]", { segIdx: i, role: "fullPage", charCount: text.length, totalSentences: sentences.length });
      console.log("[OPENAI_SPEECH_START]", { segIdx: i, charCount: text.length, voice, mode: "fullPage" });
      onSnippetFocus?.(raw); // drives PDF text-layer highlight in SmartPDFViewer (left panel)

      // Prefetch the next sentence's audio while this one plays.
      if (i + 1 < sentences.length) prefetchTTS(computeSpeechText(sentences[i + 1]));

      try {
        const result = await fetchAndPlayAudio(text, session);
        if (isStale(session)) break;
        if (result === "browser") {
          await new Promise<void>((resolve) => playBrowserSpeech(text, resolve, session));
        }
        if (!isStale(session) && i < sentences.length - 1) {
          await new Promise((r) => setTimeout(r, 150));
        }
      } catch (err: unknown) {
        if (isStale(session)) break;
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[OPENAI_SPEECH_ERROR]", { error: message, segIdx: i, mode: "fullPage" });
        console.warn("[SPEECH_ERROR]", { source: "openai", segIdx: i, mode: "fullPage", error: message });
        await new Promise<void>((resolve) => playBrowserSpeech(text, resolve, session));
      }
    }

    if (!isStale(session)) {
      notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
      setPlayState("idle");
      onSnippetFocus?.(null);
    }
    onPlayStateChange?.(false);
  }

  // ── Per-segment sequential playback (highlights mode) ─────────────────────

  async function playHighlightsSequential(segs: SpeechSegment[], fromIdx: number, session: number) {
    setPlayState("loading");

    for (let i = fromIdx; i < segs.length; i++) {
      if (isStale(session)) break;
      const seg = segs[i];
      setSegIdx(i);

      console.log("[SPEECH_SEGMENT_START]", { segIdx: i, id: seg.id, evidenceRefId: seg.evidenceRefId, charCount: seg.text.length, role: seg.role });
      setEyeText(seg.text.slice(0, 160));
      setEyeRole(seg.role ?? "highlights");
      setEyeTier(null);
      if (seg.evidenceRefId) {
        console.log("[SPEECH_SEGMENT_FOCUS]", { evidenceRefId: seg.evidenceRefId, segIdx: i, totalSegs: segs.length, source: "speech-highlights-mode" });
        console.log("[LEFT_PANEL_FOCUS_EVIDENCE]", { evidenceRefId: seg.evidenceRefId, segIdx: i, source: "speech-segment" });
        onEvidenceFocus?.(seg.evidenceRefId);
      }

      const { hasMath: hMath, hasScience: hSci, transformations: hTx } = normalizeFormulasForSpeech(seg.text);
      if (hTx > 0) console.log("[SPEECH_FORMULA_NORMALIZATION]", { segIdx: i, transformations: hTx, hasMath: hMath, hasScience: hSci });
      if (hMath)   console.log("[SPEECH_MATH_DETECTED]",    { segIdx: i, preview: seg.text.slice(0, 60) });
      if (hSci)    console.log("[SPEECH_SCIENCE_DETECTED]", { segIdx: i, preview: seg.text.slice(0, 60) });
      const hText = computeSpeechText(seg.text);
      console.log("[SPEECH_TEXT_READY]", { segIdx: i, mode: "highlights", charCount: hText.length });
      console.log("[SPEECH_TTS_TEXT_READY]", { segIdx: i, charCount: hText.length, preview: hText.slice(0, 60) });
      console.log("[OPENAI_SPEECH_START]", { segIdx: i, charCount: hText.length, voice, evidenceRefId: seg.evidenceRefId });

      // Prefetch the next segment's audio while this one plays.
      if (i + 1 < segs.length) prefetchTTS(computeSpeechText(segs[i + 1].text));

      try {
        const result = await fetchAndPlayAudio(hText, session);
        if (isStale(session)) break; // user stopped, or a newer play() superseded this loop
        if (result === "browser") {
          await new Promise<void>((resolve) => playBrowserSpeech(hText, resolve, session));
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
        console.log("[SPEECH_FALLBACK_USED]", { provider: "browser", reason: "openai-error" });
        await new Promise<void>((resolve) => playBrowserSpeech(hText, resolve, session));
      }
    }

    if (!isStale(session)) {
      notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
      setPlayState("idle");
      onEvidenceFocus?.(null);
    }
  }

  // ── Main play ──────────────────────────────────────────────────────────────

  // Silent fallback used when the requested mode has nothing to read (e.g. the
  // Page Brain hasn't synthesized yet, or has no anchors for this page) — instead
  // of surfacing an error and stopping, just read the raw page text.
  function fallbackToPageText(fromIdx: number, session: number, reason: string) {
    const sents = fpSentences.length > 0 ? fpSentences : buildQuickSentences(activePageText);
    if (!sents.length) {
      setErrorMsg("No page text available.");
      setPlayState("idle");
      return;
    }
    console.log("[SPEECH_FALLBACK_USED]", { provider: "page-text", reason, mode, sentenceCount: sents.length });
    playFullPageSequential(sents, fromIdx < sents.length ? fromIdx : 0, session);
  }

  async function play(fromIdx = 0) {
    if (isStartingRef.current) {
      logBlockedDuplicate(SPEECH_OWNER);
      return;
    }
    isStartingRef.current = true;
    console.log("[SPEECH_START_REQUEST]", { mode, fromIdx, segmentCount: segments.length, pageNumber, hasStudyModel: !!studyModel });
    console.log("[SPEECH_PLAY_REQUEST]", { mode, fromIdx, segmentCount: segments.length, pageNumber });
    stopAudio();
    // claimSpeech() force-stops any speech currently active in ANY component
    // (this one or another) before we start a new one.
    globalTokenRef.current = claimSpeech(SPEECH_OWNER);
    const session = beginSession();
    setErrorMsg(null);
    console.log("[SPEECH_START]", { mode, fromIdx, session });
    // Debounce window for a fast double-click on ▶ Play — released shortly
    // after, well before this segment's own audio would naturally finish.
    setTimeout(() => { isStartingRef.current = false; }, 400);

    // Full Page mode: sentence-by-sentence through activePageText
    if (mode === "fullPage") {
      // Use pre-computed fpSentences (two-pass splitter, includes header/footer
      // filtering); fall back to the same canonical quick-splitter (not a
      // degraded inline copy) if the mount-time effect hasn't populated it yet.
      const sents = fpSentences.length > 0 ? fpSentences : buildQuickSentences(activePageText);
      if (!sents.length) { setErrorMsg("No page text available."); return; }
      console.log("[SPEECH_FULL_PAGE_START]", { sentenceCount: sents.length, fromIdx, firstSentence: sents[0]?.slice(0, 80) });
      console.log("[SPEECH_SOURCE]", { mode: "fullPage", source: "activePageText", sentenceCount: sents.length, charCount: activePageText.length });
      console.log("[SPEECH_TEXT_READY]", { mode: "fullPage", sentenceCount: sents.length });
      playFullPageSequential(sents, fromIdx, session);
      return;
    }

    // Highlights mode: per-segment sequential playback with PDF focus
    if (mode === "highlights") {
      const segsToPlay = segments.length > 0 ? segments : (studyModel ? buildSpeechScript(studyModel, "highlights", presetId) : []);
      if (!segsToPlay.length) { fallbackToPageText(fromIdx, session, "no-highlight-anchors"); return; }
      console.log("[SPEECH_SOURCE]", { mode: "highlights", source: "finalStudyModel.visualAnchors", itemCount: segsToPlay.length, charCount: segsToPlay.reduce((n, s) => n + s.text.length, 0) });
      console.log("[SPEECH_EYE_GUIDE_SOURCE]", {
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
    const segsToPlay = segments.length > 0 ? segments : (studyModel ? buildSpeechScript(studyModel, mode, presetId) : []);
    if (!segsToPlay.length) {
      fallbackToPageText(fromIdx, session, "page-brain-not-ready");
      return;
    }

    console.log("[SPEECH_SOURCE]", {
      mode,
      source: "finalStudyModel.studyNotes",
      itemCount: segsToPlay.length,
      charCount: segsToPlay.reduce((n, s) => n + s.text.length, 0),
    });

    setPlayState("loading");

    for (let i = fromIdx; i < segsToPlay.length; i++) {
      if (isStale(session)) break;
      const seg = segsToPlay[i];
      setSegIdx(i);

      setEyeText(seg.text.slice(0, 160));
      setEyeRole(seg.role ?? mode);
      setEyeTier(seg.tier ?? null);
      if (seg.evidenceRefId) {
        onEvidenceFocus?.(seg.evidenceRefId);
        console.log("[SPEECH_EYE_FOCUS]", {
          segIdx: i, mode, evidenceRefId: seg.evidenceRefId, role: seg.role,
        });
      }
      console.log("[SPEECH_SEGMENT_START]", {
        segIdx: i, mode, role: seg.role, charCount: seg.text.length,
      });
      const { hasMath: segMath, hasScience: segSci, transformations: segTx } = normalizeFormulasForSpeech(seg.text);
      if (segTx > 0)  console.log("[SPEECH_FORMULA_NORMALIZATION]", { segIdx: i, transformations: segTx, hasMath: segMath, hasScience: segSci });
      if (segMath)    console.log("[SPEECH_MATH_DETECTED]",    { segIdx: i, preview: seg.text.slice(0, 60) });
      if (segSci)     console.log("[SPEECH_SCIENCE_DETECTED]", { segIdx: i, preview: seg.text.slice(0, 60) });
      const segText = computeSpeechText(seg.text);
      console.log("[SPEECH_TEXT_READY]", { segIdx: i, mode, charCount: segText.length });
      console.log("[SPEECH_TTS_TEXT_READY]", { segIdx: i, charCount: segText.length, mode, preview: segText.slice(0, 60) });
      console.log("[OPENAI_SPEECH_START]", { segIdx: i, charCount: segText.length, voice });

      // Prefetch the next segment's audio while this one plays.
      if (i + 1 < segsToPlay.length) prefetchTTS(computeSpeechText(segsToPlay[i + 1].text));

      try {
        const result = await fetchAndPlayAudio(segText, session);
        if (isStale(session)) break;
        if (result === "browser") {
          await new Promise<void>((resolve) => playBrowserSpeech(seg.text, resolve, session));
        }
        if (!isStale(session) && i < segsToPlay.length - 1) {
          await new Promise((r) => setTimeout(r, seg.pauseAfterMs ?? 250));
        }
      } catch (err: unknown) {
        if (isStale(session)) break;
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[OPENAI_SPEECH_ERROR]", { error: message, segIdx: i, mode });
        console.warn("[SPEECH_ERROR]", { source: "openai", segIdx: i, mode, error: message });
        console.log("[SPEECH_FALLBACK_USED]", { provider: "browser", reason: "openai-error" });
        await new Promise<void>((resolve) => playBrowserSpeech(seg.text, resolve, session));
      }
    }

    if (!isStale(session)) {
      notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
      setPlayState("idle");
      onEvidenceFocus?.(null);
    }
  }

  // Pause without aborting the sequential playback loop — the in-flight
  // fetchAndPlayAudio()/playBrowserSpeech() promise stays pending until resume()
  // lets the underlying audio/utterance finish naturally.
  function pause() {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setPlayState("paused");
    } else if (providerRef.current === "browser" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.pause();
      setPlayState("paused");
    }
  }

  // Resume playback of the currently-paused segment — does NOT restart from segIdx 0.
  function resume() {
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
      setPlayState("playing");
    } else if (providerRef.current === "browser" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.resume();
      setPlayState("playing");
    }
  }

  function stop() {
    console.log("[SPEECH_STOP_USER]", { mode, segIdx, playState });
    stopAudio();
    setSegIdx(0);
    setEyeText(null);
    setEyeRole(null);
    setEyeTier(null);
    onEvidenceFocus?.(null);
  }

  // ── "Read From Click" ───────────────────────────────────────────────────────
  // Switch to Current Page mode and start reading from the sentence the reader
  // clicked on in the PDF.
  function playFromSnippet(snippet: string) {
    const sents = fpSentences.length > 0 ? fpSentences : buildQuickSentences(activePageText);
    if (!sents.length) return;
    const idx = findBestSentenceIndex(sents, snippet);
    console.log("[SPEECH_READ_FROM_CLICK]", { page: pageNumber, idx, total: sents.length, snippet: snippet.slice(0, 60) });
    setOpen(true);
    setMode("fullPage");
    stop();
    setSegIdx(idx);
    const session = beginSession();
    setTimeout(() => playFullPageSequential(sents, idx, session), 80);
  }

  useImperativeHandle(ref, () => ({ playFromSnippet }), [fpSentences, activePageText, pageNumber]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const isPlaying  = playState === "playing";
  const isPaused   = playState === "paused";
  const isLoading  = playState === "loading";
  const hasContent = segments.length > 0 || activePageText.length > 20;

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
          {primary ? "Listen to this page" : "Study Speech"}
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
            {STUDY_SPEECH_MODES.map(m => (
              <button key={m.id} type="button" onClick={() => { setMode(m.id); stop(); }} title={m.description}
                style={{ flex: 1, padding: "4px 0", borderRadius: 6, border: mode === m.id ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.07)", background: mode === m.id ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)", color: mode === m.id ? "#a5b4fc" : "#64748b", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
              >{m.label}</button>
            ))}
          </div>

          {/* Controls row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isLoading ? (
              <button type="button" onClick={stop}
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
              <button type="button" disabled={!hasContent} onClick={() => play(0)}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.4)", background: hasContent ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)", color: hasContent ? "#a5b4fc" : "#475569", fontSize: 12, fontWeight: 700, cursor: hasContent ? "pointer" : "not-allowed" }}
              >▶ Play</button>
            )}
            <button type="button" onClick={stop}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >■ Stop</button>
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
                onChange={e => { const v = Number(e.target.value); setSpeed(v); if (audioRef.current) audioRef.current.playbackRate = v; }}
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
                    {eyeRole === "fullPage" ? "Full Page" : eyeRole ?? "Reading"}
                  </span>
                  {eyeTier && (
                    <span style={{ fontSize: 9, color: ec.text, letterSpacing: "-0.02em" }} title={`${eyeTier.label} priority`} data-testid="speech-eye-tier-stars">
                      {renderStars(eyeTier.stars)}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 11, color: "#cbd5e1", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const }}>
                  {eyeText}
                </p>
              </div>
            );
          })()}

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

          {segments.length === 0 && mode !== "fullPage" && activePageText.length < 20 && (
            <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>No content available yet — synthesis in progress.</p>
          )}
          {segments.length === 0 && mode !== "fullPage" && activePageText.length >= 20 && (
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>Reading active page text ({activePageText.length} chars).</p>
          )}
        </div>
      )}
    </div>
  );
});

export default StudySpeechPanel;
