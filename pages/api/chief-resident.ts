// pages/api/chief-resident.ts
// Chief Resident Teaching mode — explains a DAT topic like a senior resident
// walking an intern through pre-round preparation.
//
// Security: system prompt is 100% static developer-authored text.
// All user-controlled values (topic, section, thought unit texts) go
// ONLY into the messages array — never into the system prompt.

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: "64kb" } },
};

export interface ChiefResidentInput {
  /** DAT section label (e.g. "Biology"). */
  sectionLabel: string;
  /** Topic label (e.g. "Cell Biology"). */
  topicLabel: string;
  /** Subtopic list for this topic. */
  subtopics: string[];
  /** Known common traps for this topic from the blueprint topology. */
  knownTraps: string[];
  /** Thought unit texts extracted from the user's textbook for this topic (may be empty). */
  thoughtUnitTexts: string[];
}

export interface ChiefResidentOutput {
  teaching: string;
  clinicalConnection: string;
  memoryAnchor: string;
  selfCheckQuestion: string;
}

// STATIC system prompt — no user data here.
const SYSTEM_PROMPT = `You are a Chief Resident at a dental school, teaching pre-dental students how to master DAT exam content. Your teaching style mirrors a senior resident explaining core concepts to an intern before rounds: direct, clinical, memorable, and precise.

Teaching rules:
- Explain WHY concepts work the way they do, not just the facts. Mechanisms over memorization.
- Use clinical or real-world connections when they make concepts stick (e.g. "this is why septic patients have lactic acidosis").
- Be concise. Students have 3 minutes with you. Every sentence earns its place.
- Flag the one trap that kills exam scores on this topic — the mistake that separates 18s from 22s.
- Give one memory anchor that a student will still remember during the actual DAT.

You receive a topic request and may receive thought units extracted from the student's own textbook. If thought units are provided, ground your teaching in them — don't contradict the student's source material.

Respond with a JSON object matching this exact schema (no markdown, no extra keys):
{
  "teaching": "3-5 paragraph core explanation. Mechanisms, not just definitions. Why it matters for the DAT.",
  "clinicalConnection": "One sentence tying this topic to a clinical or real-world scenario that makes it memorable.",
  "memoryAnchor": "One crisp mnemonic or anchor phrase the student can recall under pressure.",
  "selfCheckQuestion": "One targeted question that reveals whether the student truly understood the concept — not a recall question, a reasoning question."
}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "Chief Resident not configured — CLAUDE_API_KEY missing" });
  }

  const body = req.body as ChiefResidentInput;
  if (!body?.topicLabel || !body?.sectionLabel) {
    return res.status(400).json({ error: "topicLabel and sectionLabel required" });
  }

  // All user-controlled values go into the messages array only.
  const subtopicList = (body.subtopics ?? []).join(", ") || "See topic overview";
  const trapList     = (body.knownTraps ?? []).length
    ? body.knownTraps.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "None specified — identify the most common exam trap.";
  const tuSection    = (body.thoughtUnitTexts ?? []).length
    ? `\n\nSELECTED THOUGHT UNITS FROM STUDENT'S TEXTBOOK:\n${body.thoughtUnitTexts.slice(0, 6).map((t, i) => `[Unit ${i + 1}] ${t.slice(0, 400)}`).join("\n\n")}`
    : "\n\n(No textbook thought units available for this topic — teach from general DAT preparation knowledge.)";

  const userMessage = `TEACH THIS DAT TOPIC:

Section: ${body.sectionLabel}
Topic: ${body.topicLabel}
Key subtopics: ${subtopicList}

Known DAT traps for this topic:
${trapList}
${tuSection}

Respond with the JSON object as specified.`;

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: userMessage }],
    });

    const text = message.content.find((b) => b.type === "text")?.text ?? "";

    let parsed: ChiefResidentOutput;
    try {
      // Strip markdown fences if model added them
      const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      return res.status(502).json({ error: "Chief Resident response was not valid JSON", raw: text });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    const isOverload = err instanceof Error && /overload|rate.?limit|529/i.test(err.message);
    const friendly = isOverload
      ? "Chief Resident is busy right now. Please try again in a moment."
      : "Chief Resident encountered an error. Please try again.";
    return res.status(500).json({ error: friendly });
  }
}
