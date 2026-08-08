// tests/whiteboard/narrationFallbackAndRecovery.test.ts
// Regression guards for the Speech Engine audit's PR B fixes to
// components/whiteboard/TldrawCanvas.tsx:
//   RC3 — a /api/tts failure that isn't an explicit useBrowserSpeech signal
//         used to silently skip the segment (no audio, no fallback). It now
//         falls back to browser speech using the segment's own text, same as
//         StudySpeechPanel already does.
//   RC4 — a force-stop from a DIFFERENT owner (e.g. StudySpeechPanel claiming
//         speech, or a tab-hidden stop) left isPlaying stuck true with
//         nothing actually playing. onForceStopCleanup now resets it.
//   RC5 — pressing Pause while a segment's TTS was still fetching was a
//         silent no-op; playback began unconditionally once the fetch
//         resolved. A pauseRequestedRef now defers playback until Resume.
//   SpeechState — a shared idle/loading/playing/paused/stopping/error
//         lifecycle enum (lib/speech/speechState.ts) is now tracked
//         alongside isPlaying/isSpeaking, so UI state doesn't depend only on
//         ref existence.

import fs from "fs";
import path from "path";

const CANVAS_FILE = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");

describe("TldrawCanvas.tsx — RC3: /api/tts failure falls back to browser speech, never a silent skip", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: resolveSegmentAudio's null result is replaced with a synthetic browser-speech fallback using the segment's own text, not returned early", () => {
    const idx = src.indexOf("let resolved = await resolveSegmentAudio(segment);");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1000);
    expect(block).toMatch(/if \(!resolved\) \{/);
    expect(block).toMatch(/resolved = \{ kind: "browser-speech", script: segment\.text \};/);
    // No early `return` inside the !resolved branch — it must fall through
    // into the shared browser-speech/audio handling below.
    const notResolvedIdx = block.indexOf("if (!resolved) {");
    const branchBody = block.slice(notResolvedIdx, block.indexOf("}", notResolvedIdx + 400));
    expect(branchBody).not.toMatch(/\breturn;\b/);
  });

  it("resolved is declared with `let`, not `const` — required for the RC3 reassignment above", () => {
    expect(src).toMatch(/let resolved = await resolveSegmentAudio\(segment\);/);
    expect(src).not.toMatch(/const resolved = await resolveSegmentAudio\(segment\);/);
  });
});

describe("TldrawCanvas.tsx — RC4: onForceStopCleanup resyncs isPlaying (and speechState) after a cross-owner force-stop", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: onForceStopCleanup calls setIsPlaying(false) and setSpeechState(\"stopping\")", () => {
    const idx = src.indexOf("const onForceStopCleanup = () => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/setIsPlaying\(false\);/);
    expect(block).toMatch(/setSpeechState\("stopping"\);/);
  });
});

describe("TldrawCanvas.tsx — RC5: pause-during-fetch defers playback instead of silently starting it", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: a pauseRequestedRef exists, set true by handlePlayPause's pause branch when neither audio nor utterance ref is populated yet", () => {
    expect(src).toMatch(/const pauseRequestedRef\s*=\s*useRef\(false\);/);
    const idx = src.indexOf("const handlePlayPause = useCallback(() => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1500);
    expect(block).toMatch(/\}\s*else\s*\{\s*\n\s*\/\/ Neither ref is populated yet/);
    expect(block).toMatch(/pauseRequestedRef\.current = true;/);
  });

  it("REQUIRED: the browser-speech branch checks pauseRequestedRef right after speak() and immediately pauses instead of letting it play", () => {
    const idx = src.indexOf('if (resolved.kind === "browser-speech") {');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1400);
    expect(block).toMatch(/window\.speechSynthesis\.speak\(utter\);\s*\n\s*if \(pauseRequestedRef\.current\) \{/);
    expect(block).toMatch(/window\.speechSynthesis\.pause\(\);/);
  });

  it("REQUIRED: the audio-element branch checks pauseRequestedRef BEFORE calling audio.play(), and returns without playing", () => {
    const idx = src.indexOf("const audio = new Audio(resolved.url);");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1200);
    const pauseCheckIdx = block.indexOf("if (pauseRequestedRef.current) {");
    const playCallIdx = block.indexOf("await audio.play()");
    expect(pauseCheckIdx).toBeGreaterThan(-1);
    expect(playCallIdx).toBeGreaterThan(-1);
    expect(pauseCheckIdx).toBeLessThan(playCallIdx);
  });

  it("REQUIRED: handlePlayPause's resume branch clears pauseRequestedRef instead of falling through to advanceForPlayback (which would skip the segment)", () => {
    const idx = src.indexOf("setIsPlaying(true);\n    if (activeAudioElRef.current) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/\} else if \(pauseRequestedRef\.current\) \{/);
    expect(block).toMatch(/pauseRequestedRef\.current = false;/);
  });
});

describe("TldrawCanvas.tsx — shared SpeechState lifecycle is tracked alongside isPlaying/isSpeaking", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("imports the shared SpeechState type and declares a speechState piece of state", () => {
    expect(src).toMatch(/import type \{ SpeechState \} from "@\/lib\/speech\/speechState";/);
    expect(src).toMatch(/const \[speechState, setSpeechState\] = useState<SpeechState>\("idle"\);/);
  });

  it("stopNarration resets speechState to idle", () => {
    const idx = src.indexOf("const stopNarration = useCallback((cancelReason: string) => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/setSpeechState\("idle"\);/);
  });

  it("onNaturalEnd sets speechState to error for an error reason and idle otherwise — not the same terminal state for both", () => {
    const idx = src.indexOf('const onNaturalEnd = (reason: "ended" | "error") => {');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/setSpeechState\(reason === "error" \? "error" : "idle"\);/);
  });
});
