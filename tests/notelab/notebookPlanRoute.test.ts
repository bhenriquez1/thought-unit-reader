// tests/notelab/notebookPlanRoute.test.ts
// M2 — source-inspection tests for pages/api/notebook-plan.ts. No existing
// API route in this repo (intelligenceSynthesis.ts included) has direct
// request/response test coverage — invoking the handler would require
// mocking NextApiRequest/NextApiResponse and the OpenAI SDK's structured-
// output client wholesale. This guards the wiring that's cheap and
// meaningful to check without that: the right schema/prompt builders are
// actually used, the request is validated before any OpenAI call, and the
// server never leaks OPENAI_API_KEY to the client.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/api/notebook-plan.ts"), "utf8");

describe("pages/api/notebook-plan.ts — wiring", () => {
  it("REQUIRED: imports NotebookPlanSchema/buildNotebookPlannerSystemPrompt/buildNotebookPlannerUserPrompt from notebookPlanner.ts — never a parallel schema/prompt", () => {
    expect(SRC).toMatch(/import \{\s*NotebookPlanSchema,\s*buildNotebookPlannerSystemPrompt,\s*buildNotebookPlannerUserPrompt,/);
    expect(SRC).toMatch(/from "@\/lib\/notelab\/notebookPlanner";/);
  });

  it("REQUIRED: validates the OpenAI response against NotebookPlanSchema before responding — never returns the model's raw output unchecked", () => {
    expect(SRC).toMatch(/NotebookPlanSchema\.parse\(plan\)/);
    expect(SRC).toMatch(/return res\.status\(200\)\.json\(validated\)/);
  });

  it("REQUIRED: rejects a request with no units array or no pageNumber before ever calling OpenAI", () => {
    // The literal string "openai.responses.parse" now also appears inside
    // callNotebookPlanner's own definition (a top-level helper, declared
    // before the handler for the L6 timeout/retry wrapper) — anchor on the
    // actual call site inside the handler instead.
    const openaiCallSiteIdx = SRC.indexOf("response = await callNotebookPlanner(input, PLAN_TIMEOUT_MS);");
    const unitsCheckIdx = SRC.indexOf('if (!Array.isArray(units))');
    const pageCheckIdx = SRC.indexOf('if (typeof pageNumber !== "number")');
    expect(openaiCallSiteIdx).toBeGreaterThan(-1);
    expect(unitsCheckIdx).toBeGreaterThan(-1);
    expect(pageCheckIdx).toBeGreaterThan(-1);
    expect(unitsCheckIdx).toBeLessThan(openaiCallSiteIdx);
    expect(pageCheckIdx).toBeLessThan(openaiCallSiteIdx);
  });

  it("REQUIRED: only accepts POST (plus HEAD for health checks) — never processes a body on another verb", () => {
    expect(SRC).toMatch(/if \(req\.method === "HEAD"\) return res\.status\(200\)\.end\(\);/);
    expect(SRC).toMatch(/if \(req\.method !== "POST"\)/);
  });

  it("REQUIRED: reads OPENAI_API_KEY only from process.env, never from the request body — the key never round-trips through the client", () => {
    expect(SRC).toMatch(/const apiKey = process\.env\.OPENAI_API_KEY;/);
    expect(SRC).not.toMatch(/req\.body\.apiKey|body\.apiKey/);
  });

  it("REQUIRED: passes styleProfile through to the system prompt (N6 personalization) and multi-source fields through to the user prompt (M2)", () => {
    const idx = SRC.indexOf("const input: Parameters<typeof openai.responses.parse>[0] = {");
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/buildNotebookPlannerSystemPrompt\(\{ styleProfile: styleProfile \?\? null \}\)/);
    expect(block).toMatch(/professorExplanation: professorExplanation \?\? null/);
    expect(block).toMatch(/studentNotes: studentNotes \?\? null/);
    expect(block).toMatch(/supplementalSources: supplementalSources \?\? null/);
  });

  it("sets a raised maxDuration, same rationale as intelligenceSynthesis.ts's own structured-output timeout fix", () => {
    expect(SRC).toMatch(/maxDuration:\s*60/);
  });
});

describe("pages/api/notebook-plan.ts — L6: timeout, retry, and failure-stage classification", () => {
  it("REQUIRED: wraps the OpenAI call with a request timeout via AbortController, same pattern as page-annotation-plan.ts/professor-lesson-plan.ts", () => {
    expect(SRC).toMatch(/new AbortController\(\)/);
    expect(SRC).toMatch(/setTimeout\(\(\) => ctrl\.abort\(\), timeoutMs\)/);
    expect(SRC).toMatch(/await openai\.responses\.parse\(input, \{ signal: ctrl\.signal \}\)/);
  });

  it("REQUIRED: retries once with backoff before giving up, and never retries a 400 invalid_request_error (retrying an identical malformed request just reproduces the same failure)", () => {
    expect(SRC).toMatch(/import \{ isInvalidRequestError \} from "@\/lib\/insights\/openaiErrorClassification";/);
    expect(SRC).toMatch(/\[NOTEBOOK_PLAN:retry\]/);
    expect(SRC).toMatch(/const RETRY_BACKOFF_MS = 700;/);
    const idx = SRC.indexOf("} catch (firstErr: any) {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/if \(isInvalidRequestError\(firstErr\)\) throw firstErr;/);
  });

  it("REQUIRED: classifies failures into distinct stages (timeout/rate_limited/invalid_request/provider_request/provider_response/schema_validation) instead of one undifferentiated 500", () => {
    for (const stage of ["timeout", "rate_limited", "invalid_request", "provider_request", "provider_response", "schema_validation"]) {
      expect(SRC).toContain(`"${stage}"`);
    }
    expect(SRC).toMatch(/code: stage,/);
  });

  it("REQUIRED: a null model output and a schema-validation failure are each classified distinctly, not folded into the generic upstream-failure branch", () => {
    expect(SRC).toMatch(/stage: "provider_response"/);
    expect(SRC).toMatch(/stage: "schema_validation"/);
    expect(SRC).toMatch(/NotebookPlanSchema\.parse\(plan\)/);
  });

  it("REQUIRED: failure and success diagnostics log unconditionally in production, not DEV-gated — matches the sibling routes' convention that production failures must stay diagnosable", () => {
    const failedIdx = SRC.indexOf('console.error("[NOTEBOOK_PLAN:failed]"');
    const successIdx = SRC.indexOf('console.log("[NOTEBOOK_PLAN:success]"');
    const retryIdx = SRC.indexOf('console.warn("[NOTEBOOK_PLAN:retry]"');
    expect(failedIdx).toBeGreaterThan(-1);
    expect(successIdx).toBeGreaterThan(-1);
    expect(retryIdx).toBeGreaterThan(-1);
    for (const idx of [failedIdx, successIdx, retryIdx]) {
      expect(SRC.slice(Math.max(0, idx - 20), idx)).not.toMatch(/DEV\s*&&\s*$/);
    }
  });

  it("still returns HTTP 500 with an { error, code } body on failure — the client (requestNotebookPlan) only reads err.error and checks response.ok, so the status/shape contract is preserved, code is a purely additive diagnostic field", () => {
    const idx = SRC.indexOf("code: stage,");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(Math.max(0, idx - 500), idx + 50);
    expect(block).toMatch(/return res\.status\(500\)\.json\(\{/);
    expect(block).toMatch(/error:/);
    expect(block).toMatch(/code: stage,/);
  });

  it("attempts count reflects whether a retry actually happened, threaded through into both success and failure diagnostics", () => {
    expect(SRC).toMatch(/let attempts = 1;/);
    expect(SRC).toMatch(/attempts = 2;/);
    expect(SRC).toMatch(/attempts,\n\s*page: pageNumber,/); // failure log
    expect(SRC).toMatch(/page: pageNumber,\n\s*attempts,/); // success log
  });
});
