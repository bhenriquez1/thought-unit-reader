import fs from "fs";
import path from "path";

const API_FILE = path.resolve(__dirname, "../../pages/api/professor-tldraw-agent.ts");
const AGENT_FILE = path.resolve(__dirname, "../../lib/whiteboard/professorTldrawAgent.ts");

describe("Professor visual-agent API boundary", () => {
  it("uses Claude vision with the current tldraw screenshot and structured step payload", () => {
    const src = fs.readFileSync(API_FILE, "utf8");
    expect(src).toMatch(/type: "image"/);
    expect(src).toMatch(/media_type: "image\/png"/);
    expect(src).toMatch(/data: screenshotBase64/);
    expect(src).toMatch(/canvas: canvasWithoutScreenshot/);
  });

  it("exposes visual primitives, erasing and camera tools without granting lesson-planning authority", () => {
    const src = fs.readFileSync(API_FILE, "utf8");
    for (const tool of [
      "drawFreehandStroke", "drawAnatomySketch", "drawMuscle", "drawBone", "drawNerve",
      "drawHatching", "drawFlowArrow", "drawPressureZone", "drawCallout", "eraseRegion", "moveCamera",
    ]) expect(src).toContain(tool);
    expect(src).toMatch(/OpenAI already authored and grounded the lesson/);
    expect(src).toMatch(/Never add a fact, invent a label, reinterpret the textbook, expose a future step/);
  });

  it("validates both the request and Claude response before returning any action", () => {
    const src = fs.readFileSync(API_FILE, "utf8");
    expect(src).toMatch(/ProfessorTldrawAgentRequestSchema\.safeParse\(req\.body\)/);
    expect(src).toMatch(/ProfessorTldrawAgentResponseSchema\.safeParse/);
    expect(src).toMatch(/parsed\.data\.stepId !== request\.data\.step\.stepId/);
    expect(src).toMatch(/parsed\.data\.pass !== request\.data\.pass/);
  });

  it("keeps the deterministic client verifier between model output and tldraw", () => {
    const src = fs.readFileSync(AGENT_FILE, "utf8");
    expect(src).toMatch(/verifyProfessorTldrawAgentResponse/);
    expect(src).toMatch(/allowedLabels/);
    expect(src).toMatch(/allowedSourceTargetIds/);
    expect(src).toMatch(/clampPoint/);
    expect(src).toMatch(/pushClearOf/);
    expect(src).toMatch(/computeAvoidanceBend/);
  });
});
