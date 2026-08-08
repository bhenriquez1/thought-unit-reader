// tests/whiteboard/narrationCacheIdentity.test.ts
// Regression guards for the Speech Engine audit's RC1 fix: TldrawCanvas's
// narration audio cache used to be keyed by a bare NarrationSegment.id
// ("seg0", "seg1", ...) whose counter resets to 0 on every new lesson build
// (lib/whiteboard/buildProfessorTeachingActions.ts's resetIdCounters()) — so
// page A's seg0 and page B's seg0 were literally the same cache key, and the
// cache was never cleared or blob-URL-revoked anywhere in the component.
// These tests guard the fix: every cache/pending-map key is qualified by a
// SpeechSessionIdentity (lib/speech/speechSessionIdentity.ts), and the cache
// is fully cleared (with blob URLs revoked) on every lesson rebuild and on
// unmount.

import fs from "fs";
import path from "path";

const CANVAS_FILE = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");

describe("TldrawCanvas.tsx — narration cache keys are identity-qualified, not bare segment.id", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("imports the shared SpeechSessionIdentity helpers", () => {
    expect(src).toMatch(/import \{ buildSpeechCacheKey, type SpeechSessionIdentity \} from "@\/lib\/speech\/speechSessionIdentity";/);
  });

  it("REQUIRED: computes a speechIdentity carrying documentId/pageNumber/pageTruthKey/owner/lessonId, kept fresh via a ref", () => {
    const idx = src.indexOf("const speechIdentity: SpeechSessionIdentity = useMemo(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/documentId:\s*effectiveDocumentId,/);
    expect(block).toMatch(/pageNumber:\s*derivedVsg\?\.sourcePageNumber \?\? 0,/);
    expect(block).toMatch(/pageTruthKey:\s*effectivePageTruthKey,/);
    expect(block).toMatch(/owner:\s*SPEECH_OWNER,/);
    expect(block).toMatch(/lessonId:\s*lessonPlan\?\.sourceSnapshot\.vsgId,/);
    expect(src).toMatch(/const speechIdentityRef = useRef\(speechIdentity\);\s*\n\s*speechIdentityRef\.current = speechIdentity;/);
  });

  it("REQUIRED: resolveSegmentAudio builds its cache/pending keys via buildSpeechCacheKey(speechIdentityRef.current, segment.id), not the raw segment.id", () => {
    const idx = src.indexOf("const resolveSegmentAudio = useCallback(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 2000);
    expect(block).toMatch(/const cacheKey = buildSpeechCacheKey\(speechIdentityRef\.current, segment\.id\);/);
    expect(block).toMatch(/narrationCacheRef\.current\.get\(cacheKey\)/);
    expect(block).toMatch(/narrationPendingRef\.current\.get\(cacheKey\)/);
    expect(block).toMatch(/narrationCacheRef\.current\.set\(cacheKey, resolved\);/);
    expect(block).toMatch(/narrationPendingRef\.current\.delete\(cacheKey\);/);
    expect(block).toMatch(/narrationPendingRef\.current\.set\(cacheKey, promise\);/);
    // No remaining bare-segment.id map access in this function.
    expect(block).not.toMatch(/narrationCacheRef\.current\.(get|set)\(segment\.id/);
    expect(block).not.toMatch(/narrationPendingRef\.current\.(get|set|delete)\(segment\.id/);
  });
});

describe("TldrawCanvas.tsx — narration cache is fully cleared (and blob URLs revoked) on identity change and unmount", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("REQUIRED: clearNarrationCache revokes every cached audio-url blob before clearing both maps", () => {
    const idx = src.indexOf("const clearNarrationCache = useCallback(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/if \(resolved\.kind === "audio-url"\)/);
    expect(block).toMatch(/URL\.revokeObjectURL\(resolved\.url\)/);
    expect(block).toMatch(/narrationCacheRef\.current\.clear\(\);/);
    expect(block).toMatch(/narrationPendingRef\.current\.clear\(\);/);
  });

  it("REQUIRED: the lesson-rebuild effect (fires on every page/document/reanalyze change) calls clearNarrationCache()", () => {
    const idx = src.indexOf("useEffect(() => {\n    const editor = editorRef.current;\n    if (!editor) return;\n\n    try {\n      clearTeachingLayer(editor);");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/stopNarration\("rebuild"\);\s*\n\s*clearNarrationCache\(\);/);
  });

  it("REQUIRED: unmount cleanup also calls clearNarrationCache() — the cache must not leak blob URLs for the life of a long reading session", () => {
    const idx = src.indexOf('useEffect(() => () => {\n    storeUnsubRef.current?.();\n    stopNarration("unmount");');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/clearNarrationCache\(\);/);
  });
});
