// tests/whiteboard/audienceComplexityPlumbing.test.ts
// L18 — the first phase of building Elena Mode Whiteboard integration.
// Investigation found Elena Mode has NO drawing capability at all today,
// and the Professor pipeline had no audience/complexity parameter to key
// simplification off. This phase threads a caller-supplied
// audience: "adult" | "child" parameter through the full existing pipeline
// (buildProfessorLessonInput -> professor-lesson-plan.ts's Director prompt
// -> ProfessorLessonPlan.sourceSnapshot -> professor-tldraw-agent.ts's
// runtime prompt) with a genuinely simpler prompt variant for both stages
// when audience is "child" — but every current real caller (the adult
// Reader, via useProfessorLesson.ts) still omits it, so this phase causes
// ZERO behavior change to the existing adult flow. Elena's own UI/wiring
// is a later phase (L19+).
//
// No jsdom/render harness for these files in this repo — source inspection,
// matching every other prompt-wiring test in this directory
// (tests/whiteboard/visualExecutionCorrection.test.ts, etc.).

import fs from "fs";
import path from "path";

const DIRECTOR_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/api/professor-lesson-plan.ts"), "utf8");
const AGENT_PROMPT_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/api/professor-tldraw-agent.ts"), "utf8");
const HOOK_SRC = fs.readFileSync(path.resolve(__dirname, "../../components/whiteboard/useProfessorLesson.ts"), "utf8");

describe("pages/api/professor-lesson-plan.ts — audience defaulting and prompt selection (L18)", () => {
  it("REQUIRED: any value besides the literal string \"child\" defaults to \"adult\" — a missing/malformed/legacy body behaves exactly as before this field existed", () => {
    expect(DIRECTOR_SRC).toMatch(/const audience: "adult" \| "child" = body\.audience === "child" \? "child" : "adult";/);
  });

  it("REQUIRED: the system prompt is SYSTEM_PROMPT alone for adult, and SYSTEM_PROMPT + an appendix for child — never a substitution, so the adult prompt is byte-for-byte unchanged", () => {
    expect(DIRECTOR_SRC).toMatch(/const systemPrompt = audience === "child" \? SYSTEM_PROMPT \+ CHILD_AUDIENCE_APPENDIX : SYSTEM_PROMPT;/);
  });

  it("REQUIRED: both callOpenAI call sites (initial attempt + retry) use the selected systemPrompt, not the bare SYSTEM_PROMPT constant", () => {
    const calls = (DIRECTOR_SRC.match(/callOpenAI\(client, model, systemPrompt, userContent, PLAN_TIMEOUT_MS, maxCompletionTokens\)/g) ?? []).length;
    expect(calls).toBe(2);
  });

  it("REQUIRED: callOpenAI itself takes systemPrompt as a real parameter and sends it as the system message — not a closed-over module constant", () => {
    const idx = DIRECTOR_SRC.indexOf("async function callOpenAI(");
    const block = DIRECTOR_SRC.slice(idx, idx + 400);
    expect(block).toMatch(/systemPrompt: string,/);
    const callBlock = DIRECTOR_SRC.slice(idx, DIRECTOR_SRC.indexOf("response_format:", idx));
    expect(callBlock).toMatch(/\{ role: "system", content: systemPrompt \}/);
  });

  it("REQUIRED: the child appendix is still fully static, developer-authored text (selected by a validated enum, never influenced by request-supplied free text) — preserving this file's own documented security property", () => {
    const idx = DIRECTOR_SRC.indexOf("const CHILD_AUDIENCE_APPENDIX = `");
    expect(idx).toBeGreaterThan(-1);
    const block = DIRECTOR_SRC.slice(idx, idx + 2000);
    // No template interpolation of request-controlled values inside the appendix itself.
    expect(block).not.toMatch(/\$\{body\./);
  });

  it("REQUIRED: the child appendix narrows register (vocabulary/sentence length) and visual complexity (avoids diagnosis/equation/data-interpretation grammars, cross-sections, dense compositions)", () => {
    const idx = DIRECTOR_SRC.indexOf("const CHILD_AUDIENCE_APPENDIX = `");
    const block = DIRECTOR_SRC.slice(idx, idx + 2000);
    expect(block).toMatch(/short, concrete, everyday words/);
    expect(block).toMatch(/"narrative", "procedure", "comparison", "hierarchy", "summary", or\s*\n\s*"concept-map"/);
    expect(block).toMatch(/avoid describing cross-sections, cutaways, dense multi-layer compositions/);
  });

  it("REQUIRED: audience is echoed into userContent so the model knows which mode it's in", () => {
    expect(DIRECTOR_SRC).toMatch(/`audience: \$\{audience\}\\n` \+/);
  });

  it("REQUIRED: diagnosticIds includes audience for production log visibility", () => {
    expect(DIRECTOR_SRC).toMatch(/diagnosticIds = \{ \.\.\.diagnosticIds, audience \};/);
  });
});

describe("pages/api/professor-tldraw-agent.ts — audience-based prompt selection (L18)", () => {
  it("REQUIRED: the system prompt is SYSTEM_PROMPT alone for adult/undefined, and SYSTEM_PROMPT + an appendix for child — same non-substitution shape as the Director", () => {
    expect(AGENT_PROMPT_SRC).toMatch(/const systemPrompt = request\.data\.audience === "child" \? SYSTEM_PROMPT \+ CHILD_AGENT_APPENDIX : SYSTEM_PROMPT;/);
  });

  it("REQUIRED: the actual Claude call uses the selected systemPrompt, not the bare SYSTEM_PROMPT constant", () => {
    const idx = AGENT_PROMPT_SRC.indexOf("client.messages.create({");
    const block = AGENT_PROMPT_SRC.slice(idx, idx + 300);
    expect(block).toMatch(/system: systemPrompt,/);
  });

  it("REQUIRED: the child appendix restricts tool vocabulary away from clinical/anatomical precision toward simple friendly shapes", () => {
    const idx = AGENT_PROMPT_SRC.indexOf("const CHILD_AGENT_APPENDIX = `");
    expect(idx).toBeGreaterThan(-1);
    const block = AGENT_PROMPT_SRC.slice(idx, idx + 1800);
    expect(block).toMatch(/Avoid drawAnatomySketch\/drawMuscle\/drawBone\/drawNerve, drawCrossSection, shadeRegion/);
    expect(block).toMatch(/Prefer drawFreehandStroke, drawSymbol \(simple friendly shapes/);
  });
});

describe("lib/whiteboard/professorTldrawAgent.ts — request schema carries audience (L18)", () => {
  it("REQUIRED: ProfessorTldrawAgentRequestSchema has an optional audience enum field", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../lib/whiteboard/professorTldrawAgent.ts"), "utf8");
    expect(src).toMatch(/audience: z\.enum\(\["adult", "child"\]\)\.optional\(\),/);
  });

  it("REQUIRED: buildProfessorTldrawAgentRequest reads it from plan.sourceSnapshot.audience, never inventing it independently", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../lib/whiteboard/professorTldrawAgent.ts"), "utf8");
    expect(src).toMatch(/audience: args\.plan\.sourceSnapshot\.audience,/);
  });
});

describe("components/whiteboard/useProfessorLesson.ts — audience threaded through both effects (L18)", () => {
  it("REQUIRED: Args accepts an optional audience field", () => {
    const idx = HOOK_SRC.indexOf("interface Args {");
    const block = HOOK_SRC.slice(idx, HOOK_SRC.indexOf("}", idx));
    expect(block).toMatch(/audience\?: "adult" \| "child";/);
  });

  it("REQUIRED: identityKey includes audience — a 'child' identity for the same page is a genuinely different lesson, not a cache/effect collision with the adult one", () => {
    const idx = HOOK_SRC.indexOf("function identityKey(");
    const block = HOOK_SRC.slice(idx, HOOK_SRC.indexOf("}", idx) + 1);
    expect(block).toMatch(/audience/);
  });

  it("REQUIRED: an omitted/adult audience produces the exact same identityKey string as before this field existed — no suffix", () => {
    const idx = HOOK_SRC.indexOf("return `${args.documentId}");
    expect(idx).toBeGreaterThan(-1);
    const line = HOOK_SRC.slice(idx, HOOK_SRC.indexOf("\n", idx));
    expect(line).toMatch(/\$\{args\.audience === "child" \? "::child" : ""\}/);
  });

  it("REQUIRED: both buildProfessorLessonCacheKey call sites (Effect A's cache-read and Effect B's cache-write) pass audience through", () => {
    const calls = (HOOK_SRC.match(/buildProfessorLessonCacheKey\(\{[^}]*audience[^}]*\}\)/g) ?? []).length;
    expect(calls).toBe(2);
  });

  it("REQUIRED: buildProfessorLessonInput is called with audienceRef.current — a ref, not the bare prop, since Effect B's own deps don't include audience directly (mirrors the existing pageTeachingTypeRef pattern)", () => {
    const idx = HOOK_SRC.indexOf("const input = buildProfessorLessonInput({");
    const block = HOOK_SRC.slice(idx, idx + 300);
    expect(block).toMatch(/audience: audienceRef\.current,/);
  });

  it("REQUIRED: buildProfessorTeachingActions receives audience (via the same ref) only when actually set, never forcing an explicit 'adult' onto the built plan", () => {
    const idx = HOOK_SRC.indexOf("const plan = buildProfessorTeachingActions(");
    const block = HOOK_SRC.slice(idx, idx + 400);
    expect(block).toMatch(/\.\.\.\(audienceRef\.current \? \{ audience: audienceRef\.current \} : \{\}\),/);
  });
});
