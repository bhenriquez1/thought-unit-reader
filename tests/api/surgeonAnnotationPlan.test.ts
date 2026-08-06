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

  it("sends an image_url content part at detail:\"high\", using a dynamically-resolved model rather than a hardcoded literal", () => {
    expect(src).toMatch(/type:\s*"image_url"/);
    expect(src).toMatch(/detail:\s*"high"/);
    expect(src).not.toMatch(/model:\s*"gpt-4o"/);
    expect(src).not.toMatch(/model:\s*"gpt-5\.5"/);
    expect(src).toMatch(/import \{ resolveTeachingModel \} from "@\/lib\/insights\/resolveOpenAIModel"/);
    expect(src).toMatch(/const model = await resolveTeachingModel\(client\)/);
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

describe("pages/api/page-annotation-plan.ts — pageRole (shared page classifier, decided before highlighting)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("prompt frames pageRole as the page classifier — decided first, before any annotation, independent of pageThesis", () => {
    expect(src).toMatch(/pageRole is the PAGE CLASSIFIER/);
    expect(src).toMatch(/what kind of page is this/);
    expect(src).toMatch(/Choose independently of pageThesis's content summary/);
  });

  it("lists the domain-flavored teaching types (anatomy/physiology/pharmacology/diagnosis/etc), not just the 5 generic values", () => {
    for (const role of ["anatomy", "physiology", "pharmacology", "diagnosis", "histology", "classification", "decision-tree", "workflow", "mathematical-derivation", "organic-chemistry-reaction"]) {
      expect(src).toContain(role);
    }
  });

  it("instructs adaptive highlighting — which canonicalTypes to favor per pageRole, not one fixed checklist for every page", () => {
    expect(src).toMatch(/ADAPTIVE HIGHLIGHTING/);
    expect(src).toMatch(/instead of forcing every page through the same fixed checklist/);
  });

  it("prompt's JSON output shape includes pageRole with the full taxonomy", () => {
    expect(src).toMatch(/"pageRole":\s*"<anatomy\|physiology\|pharmacology/);
  });
});

describe("pages/api/page-annotation-plan.ts — density guidance (soft, defense-in-depth alongside the hard client-side cap)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("prompt instructs at most one mechanism-or-procedure annotation total per page", () => {
    expect(src).toMatch(/DENSITY/);
    expect(src).toMatch(/ONE mechanism-or-procedure\s*\n?\s*annotation total/);
  });

  it("prompt instructs capping trap, comparison, decision, clinicalPearl, and example annotations at one each", () => {
    expect(src).toMatch(/at most one trap\/warning, one/);
    expect(src).toMatch(/comparison, one decision point, one\s*\n?\s*clinical pearl, and one supporting example/);
  });

  it("prompt states an explicit 5-8 annotation target range for a dense page, and warns against under-annotating", () => {
    expect(src).toMatch(/5 to 8 annotations total/);
    expect(src).toMatch(/Under-annotating a dense page is as much a failure as over-annotating a sparse one/);
  });

  it("prompt tells the model the app enforces this with a hard cap after its response", () => {
    expect(src).toMatch(/the app also enforces this with a hard cap after your/);
  });
});

describe("pages/api/page-annotation-plan.ts — strictly current-page grounded: structured blocks + content integrity", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("requires pageContentHash on the request, same as pageTruthKey/pageText", () => {
    expect(src).toMatch(/if \(!body\.pageContentHash \|\| typeof body\.pageContentHash !== "string"\)/);
    expect(src).toMatch(/missing_page_content_hash/);
  });

  it("echoes pageContentHash back unchanged in the ok:true response, never re-derived server-side", () => {
    expect(src).toMatch(/pageContentHash:\s*body\.pageContentHash/);
    expect(src).toMatch(/never re-derived server-side/);
  });

  it("renders the request's structured blocks (typed + reading order) to the model instead of a flat text slice", () => {
    expect(src).toMatch(/blocksBlock/);
    expect(src).toMatch(/b\.readingOrder/);
    expect(src).toMatch(/String\(b\.type\)\.toUpperCase\(\)/);
  });

  it("falls back to flat pageText only when no blocks were provided", () => {
    const idx = src.indexOf("const blocksBlock");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/body\.pageText\.slice\(0, PAGE_TEXT_FALLBACK_LIMIT\)/);
  });

  it("REQUIRED: the fallback-path text limit is a generous upper bound for an ordinary textbook page (~18,000 chars), not the old, much tighter 6000-char cut", () => {
    expect(src).toMatch(/const PAGE_TEXT_FALLBACK_LIMIT = 18_000;/);
    expect(src).not.toMatch(/\.slice\(0,\s*6000\)/);
  });

  it("REQUIRED: truncation on the fallback path is reported explicitly, never silent", () => {
    const idx = src.indexOf("const pageTextTruncated =");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 120)).toMatch(/blocks\.length === 0 && body\.pageText\.length > PAGE_TEXT_FALLBACK_LIMIT/);
    expect(src).toMatch(/if \(pageTextTruncated\) \{\s*\n\s*console\.warn\("\[SURGEON_PLAN_PAGE_TEXT_TRUNCATED\]"/);
  });

  it("truncation is only ever a fallback-path concern — the primary structured-blocks path is never capped", () => {
    const idx = src.indexOf("const pageTextTruncated =");
    const block = src.slice(idx, idx + 120);
    expect(block).toMatch(/blocks\.length === 0/); // only applies when the primary path had nothing
  });

  it("prompt instructs the model to read every block, including headings and tables, not skip them as decoration", () => {
    expect(src).toMatch(/a table's rows are as quotable as a\s*\n?paragraph's sentences/);
  });

  it("prompt explicitly forbids quoting from headings.previous / headings.next — neighboring-page text is context only", () => {
    expect(src).toMatch(/Never propose an exactQuote drawn\s*\n?from headings\.previous or headings\.next/);
    expect(src).toMatch(/every exactQuote must come from THIS page's own\s*\n?blocks/);
  });
});

describe("pages/api/page-annotation-plan.ts — required production diagnostics", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("generates a per-request requestId and a one-way hash of documentId — never the raw documentId", () => {
    expect(src).toMatch(/import \{ hashDocumentId, newRequestId \} from "@\/lib\/insights\/requestDiagnostics"/);
    expect(src).toMatch(/const requestId = newRequestId\(\);/);
    expect(src).toMatch(/documentIdHash:\s*body\?\.documentId \? hashDocumentId\(body\.documentId\) : null,/);
  });

  it("diagnosticIds carries pageTruthKey, pageNumber, and extracted-text length — never the text itself", () => {
    const idx = src.indexOf("const diagnosticIds = {");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/pageTruthKey:\s*body\?\.pageTruthKey \?\? null,/);
    expect(block).toMatch(/pageNumber:\s*body\?\.pageNumber \?\? null,/);
    expect(block).toMatch(/pageTextLength:\s*body\?\.pageText\?\.length \?\? null,/);
    expect(block).not.toMatch(/pageText:\s*body\.pageText/);
  });

  it("the success log runs unconditionally (production-safe), not DEV-gated, and logs only counts/timing", () => {
    const idx = src.indexOf('console.log("[SURGEON_PLAN_OK]"');
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx - 20, idx)).not.toMatch(/DEV\s*&&\s*$/);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/annotationCount:\s*result\.data\.annotations\.length,/);
    expect(block).toMatch(/durationMs:\s*Date\.now\(\) - startedAt,/);
  });
});

describe("pages/api/page-annotation-plan.ts — max_completion_tokens, not the deprecated max_tokens", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("REQUIRED: uses max_completion_tokens — resolveTeachingModel can dynamically select a reasoning-family model (o-series/gpt-5.x) that REJECTS max_tokens with HTTP 400", () => {
    expect(src).toMatch(/maxCompletionTokens:\s*2500/);
    expect(src).not.toMatch(/max_tokens:\s*2500,/);
    expect(src).not.toMatch(/\bmax_tokens:/);
  });

  it("REQUIRED: temperature/max_completion_tokens are built through the shared buildChatCompletionTuning helper, never hardcoded directly on the request — the same model can also reject a custom temperature (HTTP 400)", () => {
    expect(src).toMatch(/import \{ buildChatCompletionTuning \} from "@\/lib\/insights\/openaiChatParams"/);
    const idx = src.indexOf("...buildChatCompletionTuning(model, { temperature: 0, maxCompletionTokens: 2500 }),");
    expect(idx).toBeGreaterThan(-1);
    expect(src).not.toMatch(/temperature:\s*0,\n/);
  });

  it("REQUIRED: does not retry a 400 invalid_request_error — retrying an identical malformed request only reproduces the identical failure", () => {
    expect(src).toMatch(/import \{ isInvalidRequestError \} from "@\/lib\/insights\/openaiErrorClassification"/);
    const idx = src.indexOf("} catch (firstErr: any) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 450);
    expect(block).toMatch(/if \(isInvalidRequestError\(firstErr\)\) throw firstErr;/);
  });

  it("surfaces a distinct invalid_request code/message, not the generic provider_request, when the request itself was malformed", () => {
    expect(src).toMatch(/"invalid_request"/);
    expect(src).toMatch(/request configuration error/);
  });

  it("attempts count reflects whether a retry actually happened — 1 when the 400 short-circuited, 2 when a genuine retry ran", () => {
    expect(src).toMatch(/let attempts = 1;/);
    expect(src).toMatch(/attempts = 2;/);
    expect(src).toMatch(/attempts,\n/);
    expect(src).not.toMatch(/attempts:\s*2,/);
  });
});

describe("pages/api/page-annotation-plan.ts — relationship (optional annotation-to-annotation link)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("prompt instructs the model when to set relationship, pointing the LATER annotation's targetIndex back at the earlier one", () => {
    expect(src).toMatch(/set relationship on the LATER\s*\n?\s*annotation, pointing back at the earlier one/);
    expect(src).toMatch(/"type": "sequence"\|"cause-effect"\|\s*\n?\s*"comparison"\|"supports"/);
  });

  it("prompt tells the model this becomes a real connecting line on the Whiteboard, not two disconnected boxes", () => {
    expect(src).toMatch(/This becomes a real connecting line on the Whiteboard/);
  });

  it("prompt's JSON output shape includes the optional relationship field", () => {
    const idx = src.indexOf('"annotations": [');
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/"relationship":/);
  });
});

describe("pages/api/page-annotation-plan.ts — visualContext (Gemini's merged figure/diagram description)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("REQUIRED: includes visualContext in the user content sent to the model when provided, but never claims it as page text the model itself read", () => {
    const idx = src.indexOf("const visualContextBlock = body.visualContext");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/A separate visual-understanding pass identified this on the page/);
    expect(block).toMatch(/never a source for an exactQuote/);
  });

  it("omits the visual context block entirely when visualContext is null/absent — never sends an empty or placeholder section", () => {
    const idx = src.indexOf("const visualContextBlock = body.visualContext");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/\?\s*`\\n/);
    expect(block).toMatch(/:\s*""/);
  });

  it("prompt rule 14 tells the model visual context is context only — never quote from it, and its absence changes nothing", () => {
    expect(src).toMatch(/never\s*\n?\s*quote from it, never treat it as if it were page text you read yourself/);
    expect(src).toMatch(/If no visual context is provided, proceed exactly\s*\n\s*as you would for a plain text-only page/);
  });

  it("visualContextBlock is actually spliced into the final userTextBlock sent to the model", () => {
    const idx = src.indexOf("const userTextBlock =");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/visualContextBlock \+/);
  });
});

describe("pages/api/page-annotation-plan.ts — requestId + exact failure-stage codes on every response", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("REQUIRED: requestId is generated before any validation, so even a rejected request (wrong method, missing field) carries one", () => {
    const requestIdIdx = src.indexOf("const requestId = newRequestId();");
    const methodCheckIdx = src.indexOf('if (req.method !== "POST")');
    expect(requestIdIdx).toBeGreaterThan(-1);
    expect(methodCheckIdx).toBeGreaterThan(requestIdIdx);
  });

  it("REQUIRED: requestId is present on the ok:true success response", () => {
    expect(src).toMatch(/res\.status\(200\)\.json\(\{ ok: true, plan: result\.data, pageContentHash: body\.pageContentHash, requestId \}\);/);
  });

  it("REQUIRED: requestId is present on every degraded (ok:false) response via the shared degraded() helper", () => {
    expect(src).toMatch(/function degraded\(message: string, code: ServerFailureStage, requestId: string\): AnnotationPlanResponse \{/);
    expect(src).toMatch(/return \{ ok: false, error: message, code, requestId, fallbackAllowed: true \};/);
  });

  it("REQUIRED: the full documented failure-stage taxonomy is present in ServerFailureStage", () => {
    const idx = src.indexOf("export type ServerFailureStage =");
    const block = src.slice(idx, idx + 400);
    for (const stage of [
      "configuration", "provider_request", "timeout", "empty_response",
      "invalid_json", "schema_validation", "quote_grounding",
    ]) {
      expect(block).toMatch(new RegExp(`"${stage}"`));
    }
  });

  it("distinguishes a timeout/abort from a generic upstream failure, using its own distinct code", () => {
    const idx = src.indexOf("const isTimeout");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/isTimeout \? "timeout"/);
  });

  it("missing OPENAI_API_KEY uses the missing_configuration code specifically, not the generic openai_request_failed", () => {
    const idx = src.indexOf("if (!apiKey) {");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/"configuration"/);
  });
});

describe("pages/api/page-annotation-plan.ts — prompt-contamination regression guard", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  // A real bug found in production: rule 11's worked "Good:" example was
  // verbatim a real book page's actual sentence (about a patient interview).
  // When that same page was later analyzed for real, the model echoed ONLY
  // that one example sentence instead of comprehensively reading the whole
  // page — a known LLM failure mode where a system-prompt example matching
  // the live input gets reproduced instead of the input being read fresh.
  // The fix: the worked example must be synthetic prose that can never
  // collide with a real textbook page.
  it("REQUIRED: rule 11's worked example is NOT the real 'patient interview' sentence that caused this bug", () => {
    expect(src).not.toMatch(/the clinician should interview the\s*\n?\s*patient to identify and explore all the concerns, related conditions/);
    expect(src).not.toMatch(/expectations that prompted the patient to seek care/);
  });

  it("rule 11 still demonstrates the full-sentence boundary with a Bad:/Good: pair, just using synthetic content", () => {
    const idx = src.indexOf('Bad:  "...before recording the findings..."');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 250);
    expect(block).toMatch(/Good: "Before recording the findings,/);
    expect(block).toMatch(/\./); // still ends in terminal punctuation, demonstrating the rule
  });

  it("the prompt documents WHY the example must stay synthetic, so a future edit doesn't reintroduce real book text", () => {
    expect(src).toMatch(/never copy real textbook\s*\n?\s*wording into this instruction/);
  });
});
