// tests/api/professorLessonPlan.test.ts
// Regression guards for pages/api/professor-lesson-plan.ts — mirrors the
// pattern established for pages/api/page-annotation-plan.ts: HTTP 200 with a
// degraded envelope on every failure path, retry-with-backoff + timeout,
// structured diagnostic logging, and grounding is documented as
// non-authoritative (the real gate is client-side, against the live VSG).

import fs from "fs";
import path from "path";

const ROUTE = path.resolve(__dirname, "../../pages/api/professor-lesson-plan.ts");

describe("pages/api/professor-lesson-plan.ts — Professor Lesson Planner endpoint", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("uses a dynamically-resolved model — never a hardcoded literal", () => {
    expect(src).not.toMatch(/model:\s*"gpt-4o"/);
    expect(src).not.toMatch(/model:\s*"gpt-5\.5"/);
    expect(src).toMatch(/import \{ resolveTeachingModel \} from "@\/lib\/insights\/resolveOpenAIModel"/);
    expect(src).toMatch(/const model = await resolveTeachingModel\(client\)/);
    expect(src).toMatch(/callOpenAI\(client, model, userContent, PLAN_TIMEOUT_MS\)/);
  });

  it("uses real OpenAI Structured Outputs (strict JSON schema), not loose json_object mode — OpenAI is never asked to emit tldraw records, only ProfessorLessonScript", () => {
    expect(src).toMatch(/import \{ zodResponseFormat \} from "openai\/helpers\/zod"/);
    expect(src).toMatch(/response_format:\s*zodResponseFormat\(ProfessorLessonScriptSchema, "ProfessorLessonScript"\)/);
    expect(src).not.toMatch(/response_format:\s*\{ type: "json_object" \}/);
  });

  it("wraps the OpenAI call with a request timeout via AbortController", () => {
    expect(src).toMatch(/new AbortController\(\)/);
    expect(src).toMatch(/setTimeout\(\(\) => ctrl\.abort\(\), timeoutMs\)/);
  });

  it("retries once with backoff before giving up", () => {
    expect(src).toMatch(/PROFESSOR_LESSON_RETRY/);
    expect(src).toMatch(/RETRY_BACKOFF_MS/);
  });

  it("returns the structured degraded envelope on every failure path, never a bare error", () => {
    expect(src).toMatch(/ok:\s*false,\s*error:\s*message,\s*code/);
    expect(src).toMatch(/fallbackAllowed:\s*true/);
  });

  it("missing OPENAI_API_KEY returns HTTP 200 with the degraded envelope, not a hard error", () => {
    expect(src).toMatch(/if \(!apiKey\) \{[\s\S]{0,300}console\.error\("\[PROFESSOR_LESSON_UNAVAILABLE\]"/);
    expect(src).toMatch(/res\.status\(200\)\.json\(degraded\(/);
  });

  it("requires pageTruthKey and nodes on the request body", () => {
    expect(src).toMatch(/missing_ptk/);
    expect(src).toMatch(/missing_nodes/);
  });

  it("parses the response through ProfessorLessonScriptSchema", () => {
    expect(src).toMatch(/ProfessorLessonScriptSchema/);
  });

  it("does a lightweight, explicitly non-authoritative plausibility check before returning ok:true", () => {
    expect(src).toMatch(/function targetsPlausible/);
    expect(src).toMatch(/targetsPlausible\(result\.data, validIds\)/);
    expect(src).toMatch(/not authoritative/i);
  });

  it("keeps OPENAI_API_KEY server-side only", () => {
    expect(src).not.toMatch(/process\.env\.NEXT_PUBLIC_OPENAI_API_KEY/);
    expect(src).toMatch(/process\.env\.OPENAI_API_KEY/);
  });

  it("logs duration + diagnostic identifiers on failure", () => {
    expect(src).toMatch(/durationMs:\s*Date\.now\(\) - startedAt/);
    expect(src).toMatch(/diagnosticIds/);
  });
});

describe("pages/api/professor-lesson-plan.ts — prompt encodes the professor-performance spec", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("instructs short, hand-written labels (normally 2-8 words), never a full sentence", () => {
    expect(src).toMatch(/2 to 8 words/);
    expect(src).toMatch(/[Nn]ever a full\s*\n?\s*sentence/);
  });

  it("instructs conversational spoken narration, not textbook prose read aloud", () => {
    expect(src).toMatch(/conversational teaching\s*\n?language/);
  });

  it("requires exactly one emphasized high-yield point across the whole script", () => {
    expect(src).toMatch(/EXACTLY ONE node or edge/);
  });

  it("lists all 7 visual grammar choices", () => {
    for (const g of ["procedure", "mechanism", "anatomy", "diagnosis", "comparison", "equation", "concept-map"]) {
      expect(src).toMatch(new RegExp(g.replace("-", "\\-")));
    }
  });

  it("forbids inventing new nodes/edges or proposing coordinates", () => {
    expect(src).toMatch(/do NOT invent new nodes or edges/);
    expect(src).toMatch(/NEVER\s*\n?propose coordinates/);
  });

  it("requires one synthesis question", () => {
    expect(src).toMatch(/synthesisQuestion/);
  });
});

describe("pages/api/professor-lesson-plan.ts — pageTeachingType (shared page classifier) informs teaching style", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("prompt instructs the model to let pageTeachingType strongly inform visualGrammar and narration style", () => {
    expect(src).toMatch(/You are told this page's pageTeachingType/);
    expect(src).toMatch(/strongly inform BOTH your visualGrammar choice and how you narrate/);
  });

  it("gives per-type teaching guidance for anatomy, pharmacology, decision-tree/diagnosis, workflow, and classification", () => {
    expect(src).toMatch(/"anatomy" page should be taught by naming structures/);
    expect(src).toMatch(/"pharmacology" page by walking drug -> mechanism -> indication/);
    expect(src).toMatch(/"decision-tree" or "diagnosis" page by walking the branching decision logic/);
    expect(src).toMatch(/"classification" page as a\s*\n?\s*taxonomy/);
  });

  it("sends pageTeachingType in the user content sent to the model", () => {
    expect(src).toMatch(/pageTeachingType \(this page's classification from the highlighting pass/);
    expect(src).toMatch(/\$\{body\.pageTeachingType \?\? "none"\}/);
  });
});

describe("pages/api/professor-lesson-plan.ts — learningObjective and the 'definition' visualGrammar option", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("prompt instructs a one-sentence learningObjective distinct from the title", () => {
    expect(src).toMatch(/learningObjective is ONE sentence stating what the student should be able to DO/);
    expect(src).toMatch(/not a restatement of the title/);
  });

  it("prompt documents 'definition' as a valid visualGrammar choice", () => {
    expect(src).toMatch(/"definition" is also a valid visualGrammar choice/);
  });
});

describe("pages/api/professor-lesson-plan.ts — required production diagnostics", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("generates a per-request requestId and a one-way hash of documentId — never the raw documentId", () => {
    expect(src).toMatch(/import \{ hashDocumentId, newRequestId \} from "@\/lib\/insights\/requestDiagnostics"/);
    expect(src).toMatch(/const requestId = newRequestId\(\);/);
    expect(src).toMatch(/documentIdHash:\s*body\?\.documentId \? hashDocumentId\(body\.documentId\) : null,/);
    expect(src).not.toMatch(/documentId:\s*body\?\.documentId \?\? null/);
  });

  it("diagnosticIds carries nodeCount/edgeCount — never the node/edge text itself", () => {
    const idx = src.indexOf("let diagnosticIds: Record<string, unknown> = {");
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/nodeCount:\s*Array\.isArray\(body\?\.nodes\) \? body\.nodes\.length : null,/);
    expect(block).toMatch(/edgeCount:\s*Array\.isArray\(body\?\.edges\) \? body\.edges\.length : null,/);
  });

  it("the success log runs unconditionally (production-safe), not DEV-gated", () => {
    const idx = src.indexOf('console.log("[PROFESSOR_LESSON_OK]"');
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx - 20, idx)).not.toMatch(/DEV\s*&&\s*$/);
  });
});
