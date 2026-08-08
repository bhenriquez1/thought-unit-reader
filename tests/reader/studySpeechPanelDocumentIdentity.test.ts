// tests/reader/studySpeechPanelDocumentIdentity.test.ts
// Regression guards for the Speech Engine audit's RC2 fix: StudySpeechPanel's
// audio-cache reset effect used to watch raw bookId (the filename-derived
// key) instead of the real resolved documentId — two different PDFs sharing
// a filename would not flush the cache when switching between them. These
// tests guard the fix end-to-end: pages/index.tsx forwards resolvedDocumentId
// (not just bookId) into RightPanel, RightPanel forwards it into
// StudySpeechPanel as `documentId`, and StudySpeechPanel's cache-reset effect
// and TTS-fetch cache keys are scoped to that resolved identity.

import fs from "fs";
import path from "path";

const PANEL_FILE = path.resolve(__dirname, "../../components/reader/StudySpeechPanel.tsx");
const RIGHT_PANEL_FILE = path.resolve(__dirname, "../../components/reader/RightPanel.tsx");
const INDEX_FILE = path.resolve(__dirname, "../../pages/index.tsx");

describe("StudySpeechPanel.tsx — audio cache is scoped to the resolved document identity, not bare bookId", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("accepts an optional documentId prop, distinct from bookId", () => {
    expect(src).toMatch(/documentId\?:\s*string;/);
  });

  it("REQUIRED: computes resolvedDocId preferring documentId over bookId, and builds a SpeechSessionIdentity from it", () => {
    const idx = src.indexOf("const resolvedDocId = documentId || bookId");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/const speechIdentity: SpeechSessionIdentity = \{/);
    expect(block).toMatch(/documentId:\s*resolvedDocId,/);
    expect(block).toMatch(/pageTruthKey:\s*buildPageTruthKey\(resolvedDocId, pageNumber\),/);
    expect(block).toMatch(/owner:\s*SPEECH_OWNER,/);
  });

  it("REQUIRED: the audio-cache reset effect depends on resolvedDocId, not bare bookId — so two documents sharing a filename still flush on switch", () => {
    const idx = src.indexOf("// Reset on document change");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/audioCacheRef\.current\.clear\(\);/);
    expect(block).toMatch(/\}, \[resolvedDocId\]\);/);
    // The old bare-bookId dependency array must not still be the trigger.
    expect(block).not.toMatch(/\}, \[bookId\]\);/);
  });

  it("REQUIRED: both fetchTTS and fetchAndPlayAudio build their cache key via buildSpeechCacheKey(speechIdentity, ...), not a bare `${voice}::${text}` string", () => {
    const fetchIdx = src.indexOf("function fetchTTS(text: string)");
    expect(fetchIdx).toBeGreaterThan(-1);
    const fetchBlock = src.slice(fetchIdx, fetchIdx + 300);
    expect(fetchBlock).toMatch(/const cacheKey = buildSpeechCacheKey\(speechIdentity, `\$\{voice\}::\$\{text\}`\);/);

    const playIdx = src.indexOf("async function fetchAndPlayAudio(");
    expect(playIdx).toBeGreaterThan(-1);
    const playBlock = src.slice(playIdx, playIdx + 300);
    expect(playBlock).toMatch(/const cacheKey = buildSpeechCacheKey\(speechIdentity, `\$\{voice\}::\$\{text\}`\);/);
  });

  it("imports the shared identity helpers rather than reimplementing the key format inline", () => {
    expect(src).toMatch(/import \{ buildSpeechCacheKey, type SpeechSessionIdentity \} from "@\/lib\/speech\/speechSessionIdentity";/);
    expect(src).toMatch(/import \{ buildPageTruthKey \} from "@\/lib\/useActivePageIntelligence";/);
  });
});

describe("RightPanel.tsx — resolvedDocumentId is forwarded into StudySpeechPanel as documentId", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(RIGHT_PANEL_FILE, "utf8"); });

  it("accepts a resolvedDocumentId prop, distinct from ctx.documentId (which is actually bookId)", () => {
    expect(src).toMatch(/resolvedDocumentId\?:\s*string;/);
  });

  it("REQUIRED: the real <StudySpeechPanel> call site passes documentId={resolvedDocumentId} alongside bookId={ctx?.documentId}", () => {
    // NOT src.indexOf("<StudySpeechPanel") alone — that also matches the
    // earlier `React.Ref<StudySpeechPanelHandle>` prop type declaration.
    const idx = src.indexOf("<StudySpeechPanel\n");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("/>", idx));
    expect(block).toMatch(/bookId=\{ctx\?\.documentId\}/);
    expect(block).toMatch(/documentId=\{resolvedDocumentId\}/);
  });
});

describe("pages/index.tsx — the real resolvedDocumentId reaches <RightPanel>", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("REQUIRED: the <RightPanel> call site passes resolvedDocumentId={resolvedDocumentId}", () => {
    // NOT src.indexOf("<RightPanel") alone — that also matches the earlier
    // `useState<RightPanelState>` type argument.
    const idx = src.indexOf("<RightPanel\n");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/ctx=\{activePageContext\}/);
    expect(block).toMatch(/resolvedDocumentId=\{resolvedDocumentId\}/);
  });

  it("resolvedDocumentId itself is still built via resolveDocumentIdentity — the RC1 fix from the Thought Unit Engine audit is untouched", () => {
    expect(src).toMatch(/const resolvedDocumentId = useMemo\(\s*\n\s*\(\) => resolveDocumentIdentity\(\{ documentId: currentLocalDocumentId, fileUrl, bookId \}\),/);
  });
});
