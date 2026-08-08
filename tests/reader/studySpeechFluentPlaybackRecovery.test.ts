// tests/reader/studySpeechFluentPlaybackRecovery.test.ts
// Regression guards for the Speech Engine audit's PR B fixes to
// components/reader/StudySpeechPanel.tsx:
//   RC5 — pressing Pause while a segment's TTS was still fetching was a
//         silent no-op; playback began unconditionally once the fetch
//         resolved. A pauseRequestedRef now defers playback until Resume.
//   RC6 — the OCR-repair fetch effect re-fires for the SAME page whenever
//         activePageText refines, with no abort of its OWN previous
//         in-flight request (only page/book-change triggers an abort via
//         stopAudio()) — an older repair response could resolve after a
//         newer one and silently overwrite fpSentences with stale content.
//   RC7 — the browser-speech fallback discarded the server's
//         preprocessForBrowserTTS-cleaned script and re-spoke the original,
//         un-preprocessed client text instead.

import fs from "fs";
import path from "path";

const PANEL_FILE = path.resolve(__dirname, "../../components/reader/StudySpeechPanel.tsx");

describe("StudySpeechPanel.tsx — RC5: pause-during-fetch defers playback instead of silently starting it", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("REQUIRED: a pauseRequestedRef exists", () => {
    expect(src).toMatch(/const pauseRequestedRef = useRef\(false\);/);
  });

  it("REQUIRED: pause() sets pauseRequestedRef when playState is \"loading\" (no audio/utterance active yet)", () => {
    const idx = src.indexOf("function pause() {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/\} else if \(playState === "loading"\) \{/);
    expect(block).toMatch(/pauseRequestedRef\.current = true;/);
  });

  it("REQUIRED: resume() clears pauseRequestedRef when it was the only thing set (fetch still pending)", () => {
    const idx = src.indexOf("function resume() {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/\} else if \(pauseRequestedRef\.current\) \{/);
    expect(block).toMatch(/pauseRequestedRef\.current = false;/);
  });

  it("REQUIRED: fetchAndPlayAudio's audio.play() is gated behind a pauseRequestedRef check inside the Promise executor", () => {
    const idx = src.indexOf("async function fetchAndPlayAudio(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 3800);
    const pauseCheckIdx = block.indexOf("if (pauseRequestedRef.current) {");
    const playCallIdx = block.indexOf("audio.play().catch((e)");
    expect(pauseCheckIdx).toBeGreaterThan(-1);
    expect(playCallIdx).toBeGreaterThan(-1);
    expect(pauseCheckIdx).toBeLessThan(playCallIdx);
  });

  it("REQUIRED: playBrowserSpeech speaks then immediately pauses when a pause was requested during the preceding fetch", () => {
    const idx = src.indexOf("function playBrowserSpeech(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 6000);
    expect(block).toMatch(/window\.speechSynthesis\.speak\(utt\);\s*\n\s*if \(pauseRequestedRef\.current\) \{/);
    expect(block).toMatch(/window\.speechSynthesis\.pause\(\);/);
  });
});

describe("StudySpeechPanel.tsx — RC6: OCR-repair effect aborts its own previous in-flight request on every re-run", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("REQUIRED: repairAbortRef.current is aborted immediately before a new AbortController is created, not only via stopAudio()'s page/book-change path", () => {
    const idx = src.indexOf("if (corruptionScore > 0.08 && mode === \"fullPage\") {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    const selfAbortIdx = block.indexOf("repairAbortRef.current?.abort();");
    const newControllerIdx = block.indexOf("const ocrRepairController = new AbortController();");
    expect(selfAbortIdx).toBeGreaterThan(-1);
    expect(newControllerIdx).toBeGreaterThan(-1);
    expect(selfAbortIdx).toBeLessThan(newControllerIdx);
  });

  it("this effect still runs on activePageText refining for the SAME page (dependency array unchanged) — the fix must not require a page change to take effect", () => {
    expect(src).toMatch(/\}, \[activePageText, pageNumber\]\);/);
  });
});

describe("StudySpeechPanel.tsx — RC7: browser-speech fallback uses the server's preprocessed script, not the original client text", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("REQUIRED: fetchTTS's useBrowserSpeech branch returns the server's data.script (falling back to the original text only if absent), not a bare \"browser\" sentinel", () => {
    const idx = src.indexOf("if (data.useBrowserSpeech) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/const script = typeof data\.script === "string" && data\.script\.length > 0 \? data\.script : text;/);
    expect(block).toMatch(/return \{ browser: true, script \};/);
  });

  it("REQUIRED: fetchAndPlayAudio propagates the {browser, script} shape through instead of collapsing it to a bare string", () => {
    const idx = src.indexOf("async function fetchAndPlayAudio(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/Promise<"done" \| \{ browser: true; script: string \}>/);
    expect(block).toMatch(/if \("browser" in result\) return result;/);
  });

  it("REQUIRED: all three explicit-fallback call sites (fullPage/highlights/segment loops) pass result.script to playBrowserSpeech, not the loop's own ttsText/ttsHText/ttsSegText", () => {
    const calls = [...src.matchAll(/if \(result !== "done"\) \{\s*\n\s*await new Promise<void>\(\(resolve\) => playBrowserSpeech\(result\.script, resolve, session\)\);/g)];
    expect(calls.length).toBe(3);
  });

  it("the catch-block (genuine fetch failure, not an explicit useBrowserSpeech signal) still correctly falls back using the loop's own local text — no server script exists in that failure mode", () => {
    // Exactly 3 catch-block fallbacks remain using the loop-local text variables.
    const ttsTextCatch = (src.match(/await new Promise<void>\(\(resolve\) => playBrowserSpeech\(ttsText, resolve, session\)\);/g) ?? []).length;
    const ttsHTextCatch = (src.match(/await new Promise<void>\(\(resolve\) => playBrowserSpeech\(ttsHText, resolve, session\)\);/g) ?? []).length;
    const ttsSegTextCatch = (src.match(/await new Promise<void>\(\(resolve\) => playBrowserSpeech\(ttsSegText, resolve, session\)\);/g) ?? []).length;
    expect(ttsTextCatch).toBe(1);
    expect(ttsHTextCatch).toBe(1);
    expect(ttsSegTextCatch).toBe(1);
  });
});

describe("StudySpeechPanel.tsx — shared SpeechState lifecycle replaces the locally-duplicated PlayState union", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("imports the shared SpeechState type and aliases the local PlayState to it, rather than redeclaring the union", () => {
    expect(src).toMatch(/import type \{ SpeechState \} from "@\/lib\/speech\/speechState";/);
    expect(src).toMatch(/type PlayState = SpeechState;/);
    expect(src).not.toMatch(/type PlayState = "idle" \| "loading" \| "playing" \| "paused" \| "error";/);
  });
});
