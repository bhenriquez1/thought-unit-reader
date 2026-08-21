// tests/reader/explainChatBlobUrlCleanup.test.ts
// Stabilization fix — blob URL leak in ExplainStepChat.tsx / ExplainItChat.tsx.
//
// Root cause: both components did `new Audio(URL.createObjectURL(blob))`
// inline, without ever capturing the returned object URL string anywhere —
// so nothing could revoke it. Every "Explain This Step"/"Explain It" TTS
// answer leaked one blob URL for the life of the page session. Fixed by
// mirroring the blobUrlRef pattern already correct in
// components/reader/StudySpeechPanel.tsx and components/whiteboard/TldrawCanvas.tsx.
//
// No jsdom/render harness in this repo (testEnvironment: "node"), so this
// follows the established source-inspection pattern for React components —
// each assertion below is checked against the two components' shared
// structure (same handleSpeakAnswer shape) to guard both symmetrically.

import fs from "fs";
import path from "path";

const FILES = {
  ExplainStepChat: path.resolve(__dirname, "../../components/reader/ExplainStepChat.tsx"),
  ExplainItChat: path.resolve(__dirname, "../../components/reader/ExplainItChat.tsx"),
};

describe.each(Object.entries(FILES))("%s — Speak Answer blob URL lifecycle", (name, filePath) => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(filePath, "utf8"); });

  it("REQUIRED: declares a blobUrlRef alongside audioRef", () => {
    expect(src).toMatch(/const blobUrlRef = useRef<string \| null>\(null\);/);
  });

  it("REQUIRED: captures the object URL into blobUrlRef BEFORE constructing the Audio element — never an inline URL.createObjectURL(blob) with the return value discarded", () => {
    expect(src).not.toMatch(/new Audio\(URL\.createObjectURL\(blob\)\)/);
    expect(src).toMatch(/const blobUrl = URL\.createObjectURL\(blob\);/);
    expect(src).toMatch(/blobUrlRef\.current = blobUrl;/);
    expect(src).toMatch(/const audio = new Audio\(blobUrl\);/);
  });

  it("REQUIRED: revokes on normal completion (onended)", () => {
    const idx = src.indexOf("audio.onended = () =>");
    expect(idx).toBeGreaterThan(-1);
    const line = src.slice(idx, src.indexOf(";\n", idx) + 1 || idx + 200);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/revokeSpeakAnswerBlobUrl\(\);/);
  });

  it("REQUIRED: revokes on playback error (onerror)", () => {
    const idx = src.indexOf('audio.onerror = () => { notifySpeechError(token, SPEECH_OWNER, "audio-playback-failed");');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/revokeSpeakAnswerBlobUrl\(\);/);
  });

  it("REQUIRED: revokes when the user presses Stop mid-playback (the `if (speaking)` early-return branch)", () => {
    const idx = src.indexOf("const handleSpeakAnswer = async () => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/if \(speaking\) \{[\s\S]*revokeSpeakAnswerBlobUrl\(\);[\s\S]*return;\s*\}/);
  });

  it("REQUIRED: revokes on force-stop (a different speech owner claims the shared controller mid-playback via registerActiveAudio's callback)", () => {
    const idx = src.indexOf("registerActiveAudio(token, audio, () => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 150);
    expect(block).toMatch(/revokeSpeakAnswerBlobUrl\(\);/);
  });

  it("REQUIRED: revokes on unmount", () => {
    const idx = src.indexOf("audioRef.current?.pause();");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 150);
    expect(block).toMatch(/revokeSpeakAnswerBlobUrl\(\);/);
  });

  it("defensively revokes any leftover URL before a new Speak Answer replaces audioRef.current", () => {
    const idx = src.indexOf("isStartingRef.current = true;");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/revokeSpeakAnswerBlobUrl\(\);/);
  });

  it("revokeSpeakAnswerBlobUrl itself nulls the ref after revoking, so a second call is a safe no-op", () => {
    const idx = src.indexOf("function revokeSpeakAnswerBlobUrl() {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/if \(blobUrlRef\.current\) \{/);
    expect(block).toMatch(/URL\.revokeObjectURL\(blobUrlRef\.current\);/);
    expect(block).toMatch(/blobUrlRef\.current = null;/);
  });
});
