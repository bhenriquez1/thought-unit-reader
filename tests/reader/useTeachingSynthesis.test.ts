// tests/reader/useTeachingSynthesis.test.ts
// Regression guard for components/reader/useTeachingSynthesis.ts's retry()
// race: Effect A's cleanup only aborts abortRef.current (mainCtrl) when
// pageTruthKey changes (real navigation). retry() clears startedKeyRef and
// bumps retryCount WITHOUT changing pageTruthKey, and Effect B itself has no
// cleanup at all — so before this fix, nothing ever aborted the ORIGINAL
// mainCtrl when a same-page retry started a new one. A slow original
// response could land AFTER the retry's response and silently overwrite it
// (wired to RightPanel's "Retry OpenAI synthesis" button), since every
// staleness check inside runStages() compares against mainSignal, which
// belonged to the superseded, never-aborted controller.

import fs from "fs";
import path from "path";

const HOOK_FILE = path.resolve(__dirname, "../../components/reader/useTeachingSynthesis.ts");

describe("useTeachingSynthesis.ts — retry() on the SAME page aborts the superseded request", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("REQUIRED: Effect B aborts its own previous mainCtrl before creating a new one, ahead of runStages()", () => {
    const newCtrlIdx = src.indexOf("const mainCtrl = new AbortController();");
    expect(newCtrlIdx).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, newCtrlIdx - 500), newCtrlIdx);
    expect(before).toMatch(/abortRef\.current\?\.abort\(\);/);
  });

  it("retry() clears startedKeyRef without touching pageTruthKey, so it can only ever re-fire Effect B for the SAME page", () => {
    const idx = src.indexOf("const retry = useCallback(() => {");
    expect(idx).toBeGreaterThan(-1);
    const end = src.indexOf("}, []);", idx);
    const body = src.slice(idx, end);
    expect(body).toMatch(/startedKeyRef\.current = null;/);
    expect(body).toMatch(/setRetryCount\(c => c \+ 1\);/);
    expect(body).not.toMatch(/pageTruthKey/);
  });

  it("Effect B's dependency array includes retryCount, so retry() actually re-triggers it", () => {
    const idx = src.indexOf("// ── Effect B:");
    const effectBody = src.slice(idx);
    const depsIdx = effectBody.indexOf("}, [pageTruthKey, enabled,");
    expect(depsIdx).toBeGreaterThan(-1);
    const depsLine = effectBody.slice(depsIdx, depsIdx + 120);
    expect(depsLine).toMatch(/retryCount/);
  });
});
