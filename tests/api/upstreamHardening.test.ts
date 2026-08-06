// tests/api/upstreamHardening.test.ts
// Regression guards for the cohere-retrieval / claudeEnrichment resilience hardening:
//   - Missing API key never leaves the caller with an empty/blank result (fallbackAllowed).
//   - Structured { ok:false, code:"UPSTREAM_UNAVAILABLE", message, fallbackAllowed:true } envelope.
//   - Retry-with-backoff + request timeout around the upstream call.
//   - Structured failure logging carries duration + diagnostic identifiers.
//   - Both endpoints stay non-blocking: they never propagate a hard failure to the caller.

import fs from "fs";
import path from "path";

const CLAUDE_ROUTE = path.resolve(__dirname, "../../pages/api/claudeEnrichment.ts");
const COHERE_ROUTE = path.resolve(__dirname, "../../pages/api/cohere-retrieval.ts");
const CANVAS       = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");
const SYNTH_HOOK   = path.resolve(__dirname, "../../components/reader/useTeachingSynthesis.ts");
const RIGHT_PANEL  = path.resolve(__dirname, "../../components/reader/RightPanel.tsx");

describe("pages/api/claudeEnrichment.ts — upstream hardening", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CLAUDE_ROUTE, "utf8"); });

  it("returns the structured degraded envelope helper", () => {
    expect(src).toMatch(/ok:\s*false,\s*code:\s*"UPSTREAM_UNAVAILABLE"/);
    expect(src).toMatch(/fallbackAllowed:\s*true/);
  });

  it("degraded output still fills all ClaudeEnrichmentOutput content fields (never a bare error blob)", () => {
    expect(src).toMatch(/function degraded\(message: string\): ClaudeEnrichmentOutput \{\s*\n\s*return \{ \.\.\.emptyOutput\(\)/);
  });

  it("missing CLAUDE_API_KEY logs unconditionally (not DEV-gated) and returns 200, not a hard error", () => {
    expect(src).toMatch(/if \(!apiKey\) \{[\s\S]{0,300}console\.error\("\[CLAUDE_ENRICHMENT_UNAVAILABLE\]"/);
    expect(src).toMatch(/return res\.status\(200\)\.json\(degraded\(/);
  });

  it("wraps the Anthropic call with a request timeout via AbortController", () => {
    expect(src).toMatch(/new AbortController\(\)/);
    expect(src).toMatch(/setTimeout\(\(\) => ctrl\.abort\(\), timeoutMs\)/);
  });

  it("retries once with backoff before giving up", () => {
    expect(src).toMatch(/CLAUDE_ENRICHMENT_RETRY/);
    expect(src).toMatch(/RETRY_BACKOFF_MS/);
  });

  it("logs duration + diagnostic identifiers (pageTruthKey, canonicalUnitId) on failure", () => {
    expect(src).toMatch(/CLAUDE_ENRICHMENT_FAILED/);
    expect(src).toMatch(/durationMs:\s*Date\.now\(\) - startedAt/);
    expect(src).toMatch(/diagnosticIds/);
    expect(src).toMatch(/pageTruthKey\?:\s*string/);
    expect(src).toMatch(/canonicalUnitId\?:\s*string/);
  });

  it("total failure after retries still returns HTTP 200 with the degraded envelope (non-blocking)", () => {
    expect(src).toMatch(/CLAUDE_ENRICHMENT_FAILED[\s\S]{0,200}return res\.status\(200\)\.json\(degraded\(/);
  });
});

describe("pages/api/cohere-retrieval.ts — upstream hardening", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(COHERE_ROUTE, "utf8"); });

  it("buildFallback can carry the structured degraded envelope", () => {
    expect(src).toMatch(/code:\s*"UPSTREAM_UNAVAILABLE" as const/);
    expect(src).toMatch(/fallbackAllowed:\s*true/);
  });

  it("missing COHERE_API_KEY logs unconditionally and still returns usable fallback queries (never blank)", () => {
    expect(src).toMatch(/if \(!apiKey\) \{[\s\S]{0,300}console\.error\("\[COHERE_RETRIEVAL_UNAVAILABLE\]"/);
    expect(src).toMatch(/return res\.status\(200\)\.json\(buildFallback\(topicForFallback,/);
  });

  it("wraps the Cohere call with a request timeout via AbortController", () => {
    expect(src).toMatch(/RETRIEVAL_TIMEOUT_MS/);
    expect(src).toMatch(/new AbortController\(\)/);
  });

  it("retries once on 5xx/network failure, not on 4xx", () => {
    expect(src).toMatch(/COHERE_RETRIEVAL_RETRY/);
    expect(src).toMatch(/resp\.status >= 500/);
  });

  it("logs duration + diagnostic identifiers on failure", () => {
    expect(src).toMatch(/COHERE_RETRIEVAL_FAILED/);
    expect(src).toMatch(/durationMs:\s*Date\.now\(\) - startedAt/);
    expect(src).toMatch(/pageTruthKey\?:\s*string/);
  });

  it("every failure path returns HTTP 200 with fallback content (non-blocking, never blank)", () => {
    const failureReturns = src.match(/return res\.status\(200\)\.json\(buildFallback\(/g) ?? [];
    expect(failureReturns.length).toBeGreaterThanOrEqual(3); // missing-key, non-ok response, catch block
  });
});

describe("useTeachingSynthesis.ts — Stage 3 degraded-mode surfacing", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(SYNTH_HOOK, "utf8"); });

  it("exposes stage3ErrorMessage on the hook result", () => {
    expect(src).toMatch(/stage3ErrorMessage:\s*string \| null/);
    expect(src).toMatch(/return \{[\s\S]*stage3ErrorMessage\s*\}/);
  });

  it("detects the ok:false degraded envelope and sets a message instead of silently succeeding", () => {
    expect(src).toMatch(/enrichment\.ok === false/);
    expect(src).toMatch(/setStage3ErrorMessage\(enrichment\.message/);
  });

  it("network/timeout failure also sets a stage3ErrorMessage (not just missing-config case)", () => {
    expect(src).toMatch(/catch \(err: any\) \{\s*\n\s*if \(mainSignal\.aborted\) return;\s*\n\s*console\.error\("\[CLAUDE_EXPERT_ERROR\]"[\s\S]{0,150}setStage3ErrorMessage\(/);
  });
});

describe("RightPanel.tsx — visible degraded-mode message (no silent gap)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(RIGHT_PANEL, "utf8"); });

  it("renders a note when stage3 is degraded, instead of hiding the section entirely", () => {
    expect(src).toMatch(/stage3Status === "error" && stage3ErrorMessage/);
  });

  it("threads stage3ErrorMessage from the hook through to UltraView", () => {
    expect(src).toMatch(/stage3ErrorMessage,\s*\n\s*\} = useTeachingSynthesis/);
    expect(src).toMatch(/stage3ErrorMessage=\{stage3ErrorMessage\}/);
  });
});

describe("RightPanel.tsx — Cohere is a gap-filler, not a second independent analysis of the same topic", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(RIGHT_PANEL, "utf8"); });

  it("REQUIRED: the cohere-retrieval fetch is nested inside resolveResources' success handler, not fired in parallel — it only runs once OpenAI's response is known", () => {
    const openaiIdx = src.indexOf('fetch("/api/resolveResources"');
    const cohereIdx = src.indexOf('fetch("/api/cohere-retrieval"');
    expect(openaiIdx).toBeGreaterThan(-1);
    expect(cohereIdx).toBeGreaterThan(openaiIdx);
    // The cohere fetch must appear within the resolveResources .then() callback,
    // not as a sibling top-level fetch() call in the same effect.
    const between = src.slice(openaiIdx, cohereIdx);
    expect(between).toMatch(/\.then\(data => \{/);
    expect(between).not.toMatch(/\n {4}fetch\(/); // no other top-level fetch between them
  });

  it("REQUIRED: skips the cohere-retrieval call entirely when OpenAI already resolved both articles and videos — nothing for Cohere to fill in", () => {
    const idx = src.indexOf('fetch("/api/resolveResources"');
    const block = src.slice(idx, src.indexOf('fetch("/api/cohere-retrieval"'));
    expect(block).toMatch(/if \(articles\.length > 0 && videos\.length > 0\) return;/);
  });
});

describe("TldrawCanvas.tsx — production license guard", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("computes licenseMissingInProduction from NODE_ENV + missing key", () => {
    expect(src).toMatch(/const licenseMissingInProduction = process\.env\.NODE_ENV === "production" && !licenseKey/);
  });

  it("shows a visible role=\"alert\" instead of rendering <Tldraw> when misconfigured in production", () => {
    const idx = src.indexOf("licenseMissingInProduction ? (");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/role="alert"/);
    expect(src).toMatch(/Whiteboard configuration is unavailable/);
  });

  it("does not block rendering in development when the key is simply unset locally", () => {
    // The guard is gated on NODE_ENV === "production" — dev renders <Tldraw> unconditionally.
    expect(src).toMatch(/process\.env\.NODE_ENV === "production" && !licenseKey/);
    expect(src).not.toMatch(/!licenseKey \? \(/); // no unconditional (env-agnostic) block
  });
});
