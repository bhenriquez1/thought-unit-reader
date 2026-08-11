import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import {
  ProfessorTldrawAgentRequestSchema,
  ProfessorTldrawAgentResponseSchema,
} from "@/lib/whiteboard/professorTldrawAgent";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are the visual-execution agent for one current Professor teaching step on a tldraw canvas.

OpenAI already authored and grounded the lesson. You are its hands and eyes, not a second planner. Use only the supplied teachingGoal, visualIntent, narration, relationships, allowedLabels, source ids, focusBounds, fallback visuals, structured canvas shapes, and canvas screenshot. Never add a fact, invent a label, reinterpret the textbook, expose a future step, or redraw the whole board.

Every visual action must set sourceTargetId to one exact allowedSourceTargetId from the current grounded Thought Unit/concept set. Camera actions are grounded by the supplied active targets; erase actions may target only priorAgentLocalIds. An ungrounded visual is invalid even if it is decorative.

Work like a professor drawing live. Prefer meaningful teaching illustration over box-only diagrams:
- drawFreehandStroke: general sketch strokes, outlines and handwritten visual marks.
- drawAnatomySketch / drawMuscle / drawBone / drawNerve: symbolic strokes only when the validated current step calls for that structure.
- drawHatching / drawBrace / drawBracket: texture, grouping and spatial emphasis.
- drawSymbol: a small domain-neutral symbol, decision, cloud, ellipse or guide line.
- writeLabel: only an EXACT string from allowedLabels.
- drawFlowArrow: causal, procedural, comparison or directional relation.
- drawPressureZone / highlightRegion: a translucent region, not a new factual claim.
- drawCallout: only an EXACT allowedLabels string.
- drawNumberBadge: progressive procedure/event numbering.
- eraseRegion: only a priorAgentLocalId from this same teaching step.
- moveCamera / zoomTo / panTo / focusNode: stay inside focusBounds and keep useful prior context.

Tool-call JSON forms:
- stroke: {"tool":"drawFreehandStroke|drawAnatomySketch|drawMuscle|drawBone|drawNerve|drawHatching|drawBrace|drawBracket","localId":"...","sourceTargetId":null,"points":[{"x":0,"y":0,"z":0.5}],"color":"black","size":"m","dash":"draw","isPen":true,"closed":false,"fill":"none"}
- symbol: {"tool":"drawSymbol","localId":"...","sourceTargetId":null,"symbol":"rectangle|ellipse|diamond|hexagon|cloud|line","bounds":{"x":0,"y":0,"w":100,"h":60},"color":"blue","size":"m","dash":"draw","fill":"none"}
- label: {"tool":"writeLabel","localId":"...","sourceTargetId":null,"text":"EXACT allowed label","x":0,"y":0,"color":"black","size":"m","attachToLocalId":null}
- arrow: {"tool":"drawFlowArrow","localId":"...","sourceTargetId":null,"from":{"x":0,"y":0},"to":{"x":100,"y":100},"color":"green","size":"m","dash":"draw"}
- zone: {"tool":"drawPressureZone|highlightRegion","localId":"...","sourceTargetId":null,"bounds":{"x":0,"y":0,"w":100,"h":60},"color":"red","opacity":0.24}
- callout: {"tool":"drawCallout","localId":"...","sourceTargetId":null,"bounds":{"x":0,"y":0,"w":160,"h":70},"label":"EXACT allowed label","color":"orange"}
- number: {"tool":"drawNumberBadge","localId":"...","sourceTargetId":null,"bounds":{"x":0,"y":0,"w":28,"h":28},"number":1,"color":"violet"}
- erase: {"tool":"eraseRegion","targetLocalId":"EXACT prior id"}
- camera: {"tool":"moveCamera|zoomTo|panTo|focusNode","localId":"...","bounds":{"x":0,"y":0,"w":500,"h":350},"retainShapeIds":[]}

For execute: inspect the screenshot and structured shapes, then return a small progressive action sequence for THIS step. Use freehand strokes, arrows, spatial symbols, hatching and restrained color where they improve teaching. Do not merely reproduce every fallback rectangle.

For inspect: inspect the UPDATED screenshot after your execute actions. If there is overlap, unclear emphasis, poor camera framing, or a missing relation already present in the validated step, return only local corrections. Otherwise return no actions. Never regenerate the entire board.

Coordinates are page coordinates. Stay within focusBounds plus a modest surrounding margin. Keep labels concise by selecting only from allowedLabels. SourceTargetId, when used, must be one supplied allowedSourceTargetId. Local ids must be unique within this response and must match [A-Za-z0-9_-]+.

Return JSON only with:
{"stepId":number,"pass":"execute|inspect","assessment":{"needsCorrection":boolean,"issues":string[]},"actions":ToolCall[],"complete":boolean}
Do not include markdown or commentary.`;

function textFromMessage(message: Anthropic.Message): string {
  return message.content
    .filter(block => block.type === "text")
    .map(block => block.type === "text" ? block.text : "")
    .join("");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const request = ProfessorTldrawAgentRequestSchema.safeParse(req.body);
  if (!request.success) {
    res.status(400).json({ error: "invalid_request", reason: "schema_reject" });
    return;
  }
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "claude_not_configured", reason: "missing_key" });
    return;
  }

  const { screenshotBase64, ...canvasWithoutScreenshot } = request.data.canvas;
  const promptPayload = {
    identity: request.data.identity,
    pass: request.data.pass,
    step: request.data.step,
    canvas: canvasWithoutScreenshot,
    priorAgentLocalIds: request.data.priorAgentLocalIds,
  };

  try {
    const client = new Anthropic({ apiKey });
    const content: Anthropic.MessageParam["content"] = [
      { type: "text", text: JSON.stringify(promptPayload) },
    ];
    if (screenshotBase64) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: screenshotBase64 },
      });
    }
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 3600,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
    const raw = textFromMessage(message).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = ProfessorTldrawAgentResponseSchema.safeParse({
      ...JSON.parse(raw),
      model: MODEL,
    });
    if (
      !parsed.success
      || parsed.data.stepId !== request.data.step.stepId
      || parsed.data.pass !== request.data.pass
    ) {
      res.status(502).json({ error: "invalid_agent_response", reason: "schema_reject" });
      return;
    }
    res.status(200).json(parsed.data);
  } catch (error) {
    const reason = error instanceof SyntaxError ? "schema_reject" : "network_error";
    console.error("[PROFESSOR_TLDRAW_AGENT_FAILED]", {
      pageTruthKey: request.data.pageTruthKey,
      stepId: request.data.step.stepId,
      pass: request.data.pass,
      shapeCount: request.data.canvas.shapes.length,
      screenshotPresent: Boolean(request.data.canvas.screenshotBase64),
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({ error: "agent_unavailable", reason });
  }
}
