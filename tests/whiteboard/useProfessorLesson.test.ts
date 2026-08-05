// tests/whiteboard/useProfessorLesson.test.ts
// Regression guards for components/whiteboard/useProfessorLesson.ts — mirrors
// the Effect A/B pattern established by components/reader/
// useSurgeonAnnotations.ts (tested there): cache-first, abort stale requests
// on real identity change, never leave the canvas with nothing to perform.

import fs from "fs";
import path from "path";

const HOOK_FILE = path.resolve(__dirname, "../../components/whiteboard/useProfessorLesson.ts");

describe("useProfessorLesson.ts — identity key drives both effects", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("identityKey is built from documentId + pageTruthKey + activeCanonicalUnitId — current-page ownership", () => {
    const idx = src.indexOf("function identityKey(");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 250);
    expect(body).toMatch(/documentId/);
    expect(body).toMatch(/pageTruthKey/);
    expect(body).toMatch(/activeCanonicalUnitId/);
  });

  it("Effect A depends only on [key]", () => {
    const idx = src.indexOf("// ── Effect A:");
    const body = src.slice(idx, src.indexOf("// ── Effect B:"));
    expect(body).toMatch(/\}, \[key\]\);/);
  });

  it("Effect B's deps include key, enabled, and reanalyzeCount (via applyDeterministicFallback closure)", () => {
    const idx = src.indexOf("// ── Effect B:");
    const body = src.slice(idx);
    expect(body).toMatch(/\}, \[key, enabled, reanalyzeCount, applyDeterministicFallback\]\);/);
  });
});

describe("useProfessorLesson.ts — stale-response rejection on real navigation", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("REQUIRED: a fetch response whose script.pageTruthKey does not match the current pageTruthKey is dropped", () => {
    const idx = src.indexOf("if (script.pageTruthKey !== pageTruthKey)");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/return;/);
  });

  it("Effect A aborts any in-flight Effect B fetch when the identity key changes", () => {
    const idx = src.indexOf("// ── Effect A:");
    const body = src.slice(idx, src.indexOf("// ── Effect B:"));
    const cleanupIdx = body.indexOf("return () => {");
    const cleanup = body.slice(cleanupIdx, cleanupIdx + 200);
    expect(cleanup).toMatch(/abortRef\.current\.abort\(\)/);
  });

  it("Effect B checks ctrl.signal.aborted immediately after the fetch resolves, before applying any state", () => {
    const idx = src.indexOf("// ── Effect B:");
    const body = src.slice(idx);
    const fetchIdx = body.indexOf('await fetch("/api/professor-lesson-plan"');
    expect(fetchIdx).toBeGreaterThan(-1);
    const after = body.slice(fetchIdx, fetchIdx + 400);
    expect(after).toMatch(/if \(ctrl\.signal\.aborted\) return;/);
  });
});

describe("useProfessorLesson.ts — cache-first, then fetch", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("Effect A tries getProfessorLessonPlan before any network call", () => {
    const idx = src.indexOf("// ── Effect A:");
    const body = src.slice(idx, src.indexOf("// ── Effect B:"));
    expect(body).toMatch(/getProfessorLessonPlan\(cacheKey\)/);
    expect(body).not.toMatch(/fetch\(/);
  });

  it("Effect B persists a fresh, successfully-grounded plan back to the cache", () => {
    expect(src).toMatch(/saveProfessorLessonPlan\(/);
  });
});

describe("useProfessorLesson.ts — never leaves the canvas with nothing to perform", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("imports buildDeterministicLessonScript, the AI-free fallback generator", () => {
    expect(src).toMatch(/import \{ buildDeterministicLessonScript \} from "@\/lib\/whiteboard\/deterministicLessonScript"/);
  });

  it("applies the deterministic fallback when the API returns ok:false", () => {
    const idx = src.indexOf("if (!data.ok) {");
    const body = src.slice(idx, idx + 150);
    expect(body).toMatch(/applyDeterministicFallback\(/);
  });

  it("applies the deterministic fallback when grounding leaves zero targets, not an empty plan", () => {
    const idx = src.indexOf("if (grounded.nodeScripts.length === 0)");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 200);
    expect(body).toMatch(/applyDeterministicFallback\(/);
  });

  it("applies the deterministic fallback on a thrown/network error too", () => {
    const idx = src.indexOf("} catch (err: any) {");
    const body = src.slice(idx, idx + 300);
    expect(body).toMatch(/applyDeterministicFallback\(/);
  });
});

describe("useProfessorLesson.ts — reanalyze bypasses the cache-hit guard without freezing identity", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("exports a reanalyze callback that forces a refetch", () => {
    const idx = src.indexOf("const reanalyze = useCallback");
    const body = src.slice(idx, idx + 250);
    expect(body).toMatch(/forceRefetchRef\.current = true/);
  });
});
