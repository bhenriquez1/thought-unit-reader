// tests/whiteboard/professorEyeGuideWordSync.test.ts
// R4 — Professor's PDF eye guide shares Current Page's canonical word-level
// implementation instead of only ever painting the coarse whole-Thought-Unit
// glow. Prior state (confirmed by the R4 diagnosis): focusDirectorEvidence
// called useReadingFocusStore.setThoughtUnit() on every teaching-step
// advance, but nothing in TldrawCanvas.tsx ever called setWord() — so
// WordRectOverlay (components/SmartPDFViewer.tsx), which only paints when
// activeSpokenWord is present, never engaged during Professor playback,
// unlike Current Page's StudySpeechPanel.tsx which drives it on every TTS
// word-boundary tick via the same lib/speech/wordSync.ts estimation.
//
// No jsdom/tldraw-editor harness for this file in this repo (see
// tests/whiteboard/professorVisualRichness.test.ts) — source inspection,
// plus a real behavioral test of the shared store and the pure word-sync
// math this pass wires together.

import fs from "fs";
import path from "path";
import { useReadingFocusStore } from "../../lib/readingFocus/readingFocusStore";
import { tokenizeWords, estimateWordWeights, wordIndexForFraction } from "../../lib/speech/wordSync";

const CANVAS_FILE = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");
const INDEX_FILE = path.resolve(__dirname, "../../pages/index.tsx");

describe("TldrawCanvas.tsx — playSegmentThenAdvance drives word-level Eye Guide for SOURCE_VERBATIM segments", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: imports the same word-sync utilities Current Page's StudySpeechPanel uses — no second matcher", () => {
    expect(src).toMatch(/import \{ tokenizeWords, estimateWordWeights, wordIndexForFraction, wordIndexForCharIndex \} from "@\/lib\/speech\/wordSync";/);
  });

  it("REQUIRED: gates word-level tracking on contentRole === \"SOURCE_VERBATIM\", never on PROFESSOR_EXPLANATION segments", () => {
    const idx = src.indexOf("const isVerbatimSegment = segment.contentRole ===");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 80)).toMatch(/segment\.contentRole === "SOURCE_VERBATIM"/);
  });

  it("REQUIRED: resolves the sourceId from the director step (same lookup focusDirectorEvidence already uses) and calls setWord, not just setThoughtUnit", () => {
    const idx = src.indexOf("const playSegmentThenAdvance = useCallback");
    const block = src.slice(idx, idx + 3000);
    expect(block).toMatch(/directorStep\?\.sourceEvidence\[0\]\?\.sourceId/);
    expect(block).toMatch(/useReadingFocusStore\.getState\(\)\.setWord\(verbatimSourceId, 0, verbatimWords\[0\]\?\.word \?\? "", segment\.text\);/);
  });

  it("REQUIRED: a non-verbatim (PROFESSOR_EXPLANATION) segment clears any stale word box instead of leaving it painted, without touching the coarse anchor", () => {
    const idx = src.indexOf("const playSegmentThenAdvance = useCallback");
    const block = src.slice(idx, idx + 3000);
    expect(block).toMatch(/\} else \{[\s\S]{0,400}useReadingFocusStore\.getState\(\)\.clearWord\(\);/);
  });

  it("REQUIRED: the <audio> (OpenAI TTS) path drives setWord from ontimeupdate using the same fraction-based estimation as StudySpeechPanel.fetchAndPlayAudio", () => {
    const idx = src.indexOf("audio.ontimeupdate = () => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/wordIndexForFraction\(verbatimWeights, frac\)/);
    expect(block).toMatch(/useReadingFocusStore\.getState\(\)\.setWord\(verbatimSourceId, idx, verbatimWords\[idx\]\?\.word \?\? "", segment\.text\);/);
  });

  it("REQUIRED: the browser-speech fallback path drives setWord from real onboundary charIndex events, tokenizing the ACTUAL utterance text (resolved.script), not always segment.text", () => {
    const idx = src.indexOf("utter.onboundary = (e) => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/wordIndexForCharIndex\(utterWords, e\.charIndex\)/);
    const contextBefore = src.slice(Math.max(0, idx - 400), idx);
    expect(contextBefore).toMatch(/const utterWords = tokenizeWords\(resolved\.script\);/);
  });

  it("REQUIRED: stopNarration (the full-stop path) also clears the word-level box, matching StudySpeechPanel's clearWord-on-stop discipline", () => {
    const idx = src.indexOf("const stopNarration = useCallback");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/useReadingFocusStore\.getState\(\)\.clearWord\(\);/);
  });
});

describe("pages/index.tsx — closeProfessorWhiteboard resumes from the actual last-spoken word, not always word 0", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("REQUIRED: no longer hardcodes sourceWordIndex: 0 unconditionally", () => {
    const idx = src.indexOf("const closeProfessorWhiteboard = useCallback(() => {");
    const block = src.slice(idx, src.indexOf("}, [professorAutoStart, canonicalLeftPanelUnits, focusedEvidenceId, currentPage]);", idx));
    expect(block).not.toMatch(/sourceWordIndex: 0,\s*\n\s*sourceCharOffset: 0,/);
  });

  it("REQUIRED: reads the live wordIndex/sentenceText off useReadingFocusStore, gated on the store's anchor still matching the unit being resumed", () => {
    const idx = src.indexOf("const closeProfessorWhiteboard = useCallback(() => {");
    const block = src.slice(idx, src.indexOf("}, [professorAutoStart, canonicalLeftPanelUnits, focusedEvidenceId, currentPage]);", idx));
    expect(block).toMatch(/const liveFocus = useReadingFocusStore\.getState\(\);/);
    expect(block).toMatch(/liveFocus\.thoughtUnitId === liveAnchorId && !!liveFocus\.sentenceText/);
    expect(block).toMatch(/sourceWordIndex: hasLiveWordPosition \? liveFocus\.wordIndex : 0,/);
  });

  it("still preserves every pre-existing resume guard from the earlier stabilization fix (live focusedEvidenceId lookup, no [0] fallback, returnFromProfessor delegation)", () => {
    const idx = src.indexOf("const closeProfessorWhiteboard = useCallback(() => {");
    const block = src.slice(idx, src.indexOf("}, [professorAutoStart, canonicalLeftPanelUnits, focusedEvidenceId, currentPage]);", idx));
    expect(block).toMatch(/u\.evidenceRefId === focusedEvidenceId \|\| u\.id === focusedEvidenceId/);
    expect(block).not.toMatch(/canonicalLeftPanelUnits\[0\]/);
    expect(block).toMatch(/speechPanelRef\.current\?\.returnFromProfessor\(cursor\);/);
  });
});

describe("Word-sync math (real behavioral test) — the exact estimation Professor's <audio> path now uses", () => {
  it("a source passage's word weights place the first word at fraction 0 and later words at increasing fractions", () => {
    const words = tokenizeWords("Ethanol reacts with oxygen to produce acetic acid.");
    const weights = estimateWordWeights(words);
    expect(weights[0]).toBe(0);
    expect(weights[weights.length - 1]).toBeGreaterThan(0);
    for (let i = 1; i < weights.length; i++) expect(weights[i]).toBeGreaterThanOrEqual(weights[i - 1]);
  });

  it("wordIndexForFraction recovers a mid-passage word index from a playback fraction, the same lookup ontimeupdate performs every tick", () => {
    const words = tokenizeWords("The mitochondria is the powerhouse of the cell because it generates ATP.");
    const weights = estimateWordWeights(words);
    const midIdx = wordIndexForFraction(weights, 0.5);
    expect(midIdx).toBeGreaterThan(0);
    expect(midIdx).toBeLessThan(words.length);
  });
});

describe("useReadingFocusStore — setWord/clearWord contract this pass relies on", () => {
  beforeEach(() => { useReadingFocusStore.getState().clearFocus(); });

  it("setWord updates wordIndex/word/sentenceText and only switches thoughtUnitId when the anchor actually changes", () => {
    useReadingFocusStore.getState().setThoughtUnit("tu-1");
    useReadingFocusStore.getState().setWord("tu-1", 3, "oxygen", "Ethanol reacts with oxygen.");
    const s = useReadingFocusStore.getState();
    expect(s.thoughtUnitId).toBe("tu-1");
    expect(s.wordIndex).toBe(3);
    expect(s.word).toBe("oxygen");
    expect(s.sentenceText).toBe("Ethanol reacts with oxygen.");
  });

  it("clearWord drops wordIndex/word/sentenceText but leaves thoughtUnitId untouched — exactly what lets the coarse glow survive a switch to PROFESSOR_EXPLANATION", () => {
    useReadingFocusStore.getState().setWord("tu-1", 2, "reacts", "Ethanol reacts with oxygen.");
    useReadingFocusStore.getState().clearWord();
    const s = useReadingFocusStore.getState();
    expect(s.thoughtUnitId).toBe("tu-1");
    expect(s.wordIndex).toBe(0);
    expect(s.word).toBeNull();
    expect(s.sentenceText).toBeNull();
  });
});
