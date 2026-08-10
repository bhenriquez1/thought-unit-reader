import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  ProfessorTldrawAgentResponseSchema,
  type ProfessorTldrawAgentStepInput,
} from "@/lib/whiteboard/professorTldrawAgent";

const RequestSchema = z.object({
  pageTruthKey: z.string().min(1),
  steps: z.array(z.object({
    stepId: z.number().int().nonnegative(),
    visualNeeded: z.boolean(),
    teachingStructure: z.string().min(1).max(80),
    visualIntent: z.string().min(1).max(240),
    cameraIntent: z.enum(["stay-on-pdf", "active-concept", "keep-context", "comparison", "follow-sequence", "summary-overview"]),
    activeTargetIds: z.array(z.string()).max(12),
    retainContextTargetIds: z.array(z.string()).max(8),
    canvasState: z.array(z.object({ shapeId: z.string(), semanticRole: z.string().max(80) })).max(40),
  })).min(1).max(24),
});

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are the constrained visual-execution director for a tldraw Professor lesson.
OpenAI already produced the validated, current-page-grounded lesson. You must not reinterpret it,
add facts, add labels, add shapes, invent ids, expose future steps, or change geometry.

For each supplied visual step, inspect canvasState (the already-revealed shapes and their semantic
roles), then decide only:
- cameraIntent: active-concept, keep-context, comparison, follow-sequence, or summary-overview;
- retainContextTargetIds: zero or more ids already present in that step's activeTargetIds;
- correctionNeeded: true only when your choice changes the supplied camera choreography.

For visualNeeded=false, return stay-on-pdf and no retained ids. Comparisons should frame both
available sides; mechanisms/procedures/timelines should follow sequence and retain the immediately
useful prior context; summaries use summary-overview. Never return an id you were not given.
Return JSON only: {"model":"${MODEL}","patches":[...]}.`;

function textFromMessage(message: Anthropic.Message): string {
  return message.content.filter(block => block.type === "text").map(block => block.type === "text" ? block.text : "").join("");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const request = RequestSchema.safeParse(req.body);
  if (!request.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "claude_not_configured" });
    return;
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1800,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: JSON.stringify({ steps: request.data.steps satisfies ProfessorTldrawAgentStepInput[] }),
      }],
    });
    const raw = textFromMessage(message).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = ProfessorTldrawAgentResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      res.status(502).json({ error: "invalid_agent_response" });
      return;
    }
    // The client applies a second deterministic id/subset gate. Returning
    // the parsed structure here never grants Claude direct tldraw access.
    res.status(200).json({ ...parsed.data, model: MODEL });
  } catch (error) {
    console.error("[PROFESSOR_TLDRAW_AGENT_FAILED]", {
      pageTruthKey: request.data.pageTruthKey,
      stepCount: request.data.steps.length,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({ error: "agent_unavailable" });
  }
}
