// tests/reader/contentRoleGatedWordTracking.test.ts
// P0 stabilization, Tier 3, item 3 — word-level PDF Eye Guide tracking
// (useReadingFocusStore.setWord, consumed by WordRectOverlay's geometry
// search against the real PDF text layer) must only ever run for
// SOURCE_VERBATIM segments. Before this fix, beginKaraoke()'s
// useReadingFocusStore.setWord() call — and the ongoing per-word update in
// onSpokenWordIndex() — fired unconditionally for every segment, including
// checkpoint/PROFESSOR_EXPLANATION segments (lib/speech/studySpeechEngine.ts's
// "checkpoint" role, tagged contentRole: "PROFESSOR_EXPLANATION") whose text
// is AI-generated, never extracted from the page — word-matching it against
// the PDF is either a silent no-op or a coincidental wrong-word match.
//
// No jsdom/render harness for StudySpeechPanel.tsx in this repo — source
// inspection, matching this repo's established pattern for this file.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/reader/StudySpeechPanel.tsx"), "utf8");

describe("components/reader/StudySpeechPanel.tsx — word-level PDF tracking gated by contentRole", () => {
  it("REQUIRED: beginKaraoke accepts a contentRole parameter, defaulting to SOURCE_VERBATIM", () => {
    const idx = SRC.indexOf("function beginKaraoke(");
    expect(idx).toBeGreaterThan(-1);
    const signature = SRC.slice(idx, idx + 300);
    expect(signature).toMatch(/contentRole: SpeechContentRole = "SOURCE_VERBATIM"/);
  });

  it("REQUIRED: beginKaraoke only calls useReadingFocusStore.setWord (the PDF-facing call) when contentRole is SOURCE_VERBATIM", () => {
    const idx = SRC.indexOf("function beginKaraoke(");
    const block = SRC.slice(idx, idx + 1400);
    expect(block).toMatch(/if \(contentRole === "SOURCE_VERBATIM"\) \{\s*\n\s*useReadingFocusStore\.getState\(\)\.setWord\(/);
  });

  it("REQUIRED: beginKaraoke still sets the on-screen karaoke/reading-bar state unconditionally — only the PDF-facing call is gated, not the panel's own transcript highlight", () => {
    const idx = SRC.indexOf("function beginKaraoke(");
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/setKaraokeWords\(displayWords\);/);
    expect(block).toMatch(/setActiveWordIdx\(0\);/);
  });

  it("REQUIRED: onSpokenWordIndex (the ongoing per-word-boundary update during playback) also gates its setWord call on the active segment's content role", () => {
    const idx = SRC.indexOf("function onSpokenWordIndex(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/if \(activeContentRoleRef\.current !== "SOURCE_VERBATIM"\) return;/);
    // The gate must come BEFORE the setWord call, not after.
    const gateIdx = block.indexOf('if (activeContentRoleRef.current !== "SOURCE_VERBATIM") return;');
    const setWordIdx = block.indexOf("useReadingFocusStore.getState().setWord(");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(setWordIdx).toBeGreaterThan(gateIdx);
  });

  it("REQUIRED: onSpokenWordIndex still updates the on-screen karaoke index unconditionally — the gate only blocks the PDF-facing store write", () => {
    const idx = SRC.indexOf("function onSpokenWordIndex(");
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/setActiveWordIdx\(scaled\);/);
    const gateIdx = block.indexOf('if (activeContentRoleRef.current !== "SOURCE_VERBATIM") return;');
    const setActiveWordIdxIdx = block.indexOf("setActiveWordIdx(scaled);");
    expect(setActiveWordIdxIdx).toBeLessThan(gateIdx);
  });

  it("REQUIRED: the always-verbatim Current Page (fullPage) loop passes contentRole explicitly as SOURCE_VERBATIM", () => {
    expect(SRC).toMatch(/beginKaraoke\(ttsText, ttsText, matchedId \?\? lastMatchedId, raw, 0, "SOURCE_VERBATIM"\);/);
  });

  it("REQUIRED: the highlights-mode and guided-mode segment loops pass the segment's real contentRole, not a hardcoded value", () => {
    expect(SRC).toMatch(/beginKaraoke\(eyeHText, ttsHText, seg\.evidenceRefId \?\? null, seg\.rawText, hWordOffset, seg\.contentRole\);/);
    expect(SRC).toMatch(/beginKaraoke\(eyeSegText, ttsSegText, seg\.evidenceRefId \?\? null, seg\.rawText, segWordOffset, seg\.contentRole\);/);
  });
});
