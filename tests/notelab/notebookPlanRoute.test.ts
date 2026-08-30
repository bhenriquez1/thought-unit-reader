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
    const openaiCallIdx = SRC.indexOf("openai.responses.parse");
    const unitsCheckIdx = SRC.indexOf('if (!Array.isArray(units))');
    const pageCheckIdx = SRC.indexOf('if (typeof pageNumber !== "number")');
    expect(unitsCheckIdx).toBeGreaterThan(-1);
    expect(pageCheckIdx).toBeGreaterThan(-1);
    expect(unitsCheckIdx).toBeLessThan(openaiCallIdx);
    expect(pageCheckIdx).toBeLessThan(openaiCallIdx);
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
    const idx = SRC.indexOf("const response = await openai.responses.parse(");
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
