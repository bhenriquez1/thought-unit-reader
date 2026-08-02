// tests/api/surgeonAnnotationPlan.test.ts
// Regression guards for pages/api/page-annotation-plan.ts:
//   - Vision-capable model call with a real image_url content part.
//   - Missing-key / failure never returns a hard error to the client — always
//     HTTP 200 with a { ok:false, code, error, fallbackAllowed:true } envelope,
//     matching the pattern established in pages/api/claudeEnrichment.ts and
//     pages/api/cohere-retrieval.ts this session.
//   - Retry-with-backoff + request timeout around the upstream call.
//   - Structured failure logging carries duration + diagnostic identifiers.
//   - The server-side quote check is explicitly documented as non-authoritative.

import fs from "fs";
import path from "path";

const ROUTE = path.resolve(__dirname, "../../pages/api/page-annotation-plan.ts");

describe("pages/api/page-annotation-plan.ts — SurgeonAnnotationPlan endpoint", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("calls a vision-capable model with an image_url content part at detail:\"high\"", () => {
    expect(src).toMatch(/model:\s*"gpt-4o"/);
    expect(src).toMatch(/type:\s*"image_url"/);
    expect(src).toMatch(/detail:\s*"high"/);
  });

  it("wraps the OpenAI call with a request timeout via AbortController", () => {
    expect(src).toMatch(/new AbortController\(\)/);
    expect(src).toMatch(/setTimeout\(\(\) => ctrl\.abort\(\), timeoutMs\)/);
  });

  it("retries once with backoff before giving up", () => {
    expect(src).toMatch(/SURGEON_PLAN_RETRY/);
    expect(src).toMatch(/RETRY_BACKOFF_MS/);
  });

  it("returns the structured degraded envelope on every failure path, never a bare error", () => {
    expect(src).toMatch(/ok:\s*false,\s*error:\s*message,\s*code/);
    expect(src).toMatch(/fallbackAllowed:\s*true/);
  });

  it("missing OPENAI_API_KEY logs unconditionally (not DEV-gated) and returns HTTP 200, not a hard error", () => {
    expect(src).toMatch(/if \(!apiKey\) \{[\s\S]{0,300}console\.error\("\[SURGEON_PLAN_UNAVAILABLE\]"/);
    expect(src).toMatch(/res\.status\(200\)\.json\(degraded\(/);
  });

  it("upstream failure after retries still returns HTTP 200 with the degraded envelope (non-blocking)", () => {
    expect(src).toMatch(/SURGEON_PLAN_FAILED[\s\S]{0,400}res\.status\(200\)\.json\(degraded\(/);
  });

  it("logs duration + diagnostic identifiers (pageTruthKey, pageNumber) on failure", () => {
    expect(src).toMatch(/durationMs:\s*Date\.now\(\) - startedAt/);
    expect(src).toMatch(/diagnosticIds/);
    expect(src).toMatch(/pageTruthKey:\s*body\?\.pageTruthKey/);
  });

  it("documents that the server-side quote check is non-authoritative", () => {
    expect(src).toMatch(/NOT authoritative/i);
  });

  it("does a lightweight plausibility check on quotes before returning ok:true", () => {
    expect(src).toMatch(/function quotesPlausible/);
    expect(src).toMatch(/quotesPlausible\(result\.data, body\.pageText\)/);
  });

  it("parses the response through SurgeonAnnotationPlanSchema, not the old canonicalUnitIds-based schema", () => {
    expect(src).toMatch(/SurgeonAnnotationPlanSchema/);
    expect(src).not.toMatch(/canonicalUnitIds/);
  });

  it("bumped the body size limit for image payloads", () => {
    expect(src).toMatch(/sizeLimit:\s*"4mb"/);
  });

  it("keeps OPENAI_API_KEY server-side only", () => {
    expect(src).not.toMatch(/process\.env\.NEXT_PUBLIC_OPENAI_API_KEY/);
    expect(src).toMatch(/process\.env\.OPENAI_API_KEY/);
  });
});
