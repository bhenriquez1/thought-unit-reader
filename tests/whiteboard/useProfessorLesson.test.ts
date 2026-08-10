// tests/whiteboard/useProfessorLesson.test.ts
// Regression guards for components/whiteboard/useProfessorLesson.ts — mirrors
// the Effect A/B pattern established by components/reader/
// useSurgeonAnnotations.ts (tested there): cache-first, abort stale requests
// on real identity change. Deliberately has NO fallback (see the "no
// fallback" describe block below) — a failure surfaces as status:"error",
// never a silently-substituted generic lesson.

import fs from "fs";
import path from "path";

const HOOK_FILE = path.resolve(__dirname, "../../components/whiteboard/useProfessorLesson.ts");

describe("useProfessorLesson.ts — identity key drives both effects", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("identityKey is built from documentId + pageTruthKey + activeCanonicalUnitId + vsgId — current-page and evidence ownership", () => {
    const idx = src.indexOf("function identityKey(");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 350);
    expect(body).toMatch(/documentId/);
    expect(body).toMatch(/pageTruthKey/);
    expect(body).toMatch(/activeCanonicalUnitId/);
    expect(body).toMatch(/vsgId/);
  });

  it("Effect A depends only on [key]", () => {
    const idx = src.indexOf("// ── Effect A:");
    const body = src.slice(idx, src.indexOf("// ── Effect B:"));
    expect(body).toMatch(/\}, \[key\]\);/);
  });

  it("Effect B's deps include key, enabled, and reanalyzeCount", () => {
    const idx = src.indexOf("// ── Effect B:");
    const body = src.slice(idx);
    expect(body).toMatch(/\}, \[key, enabled, reanalyzeCount\]\);/);
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

  it("cache lookup requires documentId, pageTruthKey, and vsgId to match the live evidence", () => {
    expect(src).toMatch(/stored\.plan\.sourceSnapshot\.documentId === documentId/);
    expect(src).toMatch(/stored\.plan\.sourceSnapshot\.pageTruthKey === pageTruthKey/);
    expect(src).toMatch(/stored\.plan\.sourceSnapshot\.vsgId === vsgId/);
  });
});

describe("useProfessorLesson.ts — NO fallback: a failure surfaces status:'error', never a substituted generic lesson", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("does not import the retired deterministic fallback generator", () => {
    expect(src).not.toMatch(/deterministicLessonScript/);
    expect(src).not.toMatch(/applyDeterministicFallback/);
  });

  it("an API ok:false response sets status 'error' with a specific message, and leaves lessonPlan alone (stays null on first load)", () => {
    const idx = src.indexOf("if (!data.ok) {");
    const body = src.slice(idx, idx + 900);
    expect(body).toMatch(/setErrorMessage\(GENERIC_ERROR_MESSAGE\)/);
    expect(body).toMatch(/setStatus\("error"\)/);
    expect(body).not.toMatch(/setLessonPlan\(/);
  });

  it("zero groundable targets sets status 'error', not an empty-but-successful plan", () => {
    const idx = src.indexOf("if (grounded.nodeScripts.length === 0)");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 900);
    expect(body).toMatch(/setErrorMessage\(GENERIC_ERROR_MESSAGE\)/);
    expect(body).toMatch(/setStatus\("error"\)/);
  });

  it("a thrown/network error sets status 'error' too", () => {
    const idx = src.indexOf("} catch (err: any) {");
    const body = src.slice(idx, idx + 900);
    expect(body).toMatch(/setErrorMessage\(GENERIC_ERROR_MESSAGE\)/);
    expect(body).toMatch(/setStatus\("error"\)/);
  });

  it("errorMessage (not usingFallback) is part of the returned result", () => {
    const idx = src.lastIndexOf("return {");
    const body = src.slice(idx, idx + 150);
    expect(body).toMatch(/errorMessage/);
    expect(body).not.toMatch(/usingFallback/);
  });

  it("returns structured endpoint/request/model/failure-stage diagnostics for production correlation", () => {
    expect(src).toMatch(/errorDiagnostics/);
    expect(src).toMatch(/endpoint: "\/api\/professor-lesson-plan"/);
    expect(src).toMatch(/failureStage: data\.failureStage/);
    expect(src).toMatch(/responseStatus: res\.status/);
  });
});

describe("useProfessorLesson.ts — pageTeachingType (shared page classifier) threads through to the request", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("accepts pageTeachingType as an arg and passes it into buildProfessorLessonInput", () => {
    expect(src).toMatch(/pageTeachingType\?:\s*string \| null;/);
    const idx = src.indexOf("buildProfessorLessonInput({");
    const body = src.slice(idx, idx + 200);
    expect(body).toMatch(/pageTeachingType:\s*pageTeachingTypeRef\.current/);
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

describe("useProfessorLesson.ts — reanalyze() on the SAME identity aborts the superseded request", () => {
  // Regression: Effect A's cleanup only aborts abortRef.current when the
  // identity key changes (real page/unit navigation). A same-identity
  // reanalyze() replays Effect B via reanalyzeCount without the key
  // changing, so nothing else ever cancelled the ORIGINAL request — a slow
  // original response could land AFTER the retry's and silently overwrite
  // it (wired to TldrawCanvas's "Retry" button).
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("REQUIRED: Effect B aborts its own previous controller before creating a new one, ahead of every fetch it might start", () => {
    const idx = src.indexOf("// ── Effect B:");
    const effectBody = src.slice(idx, idx + 2000);
    const newCtrlIdx = effectBody.indexOf("const ctrl = new AbortController();");
    expect(newCtrlIdx).toBeGreaterThan(-1);
    const before = effectBody.slice(Math.max(0, newCtrlIdx - 300), newCtrlIdx);
    expect(before).toMatch(/abortRef\.current\?\.abort\(\);/);
  });
});
