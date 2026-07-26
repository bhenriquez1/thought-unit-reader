// pages/api/dat-study-sheet.ts
// DAT Study Sheet Generator — produces a one-concept visual study sheet
// in the style of an experienced DAT instructor's handwritten notes.
// Input: concept + subject + optional synthesis context.
// Output: DATStudySheet validated by Zod structured output.

const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { DATStudySheetSchema, type DATStudySheet } from "@/lib/notelab/datStudySheet";

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: "1mb" } },
};

const apiKey  = process.env.OPENAI_API_KEY;
const openai  = new OpenAI({ apiKey });

let FORMAT: ReturnType<typeof zodTextFormat> | null = null;
try {
  FORMAT = zodTextFormat(DATStudySheetSchema, "dat_study_sheet");
} catch (e) {
  DEV && console.error("[DAT_SHEET:init:SCHEMA_FAIL]", e instanceof Error ? e.message : String(e));
}

const SYSTEM_PROMPT = `You are an experienced DAT instructor creating a one-page visual study sheet.

You are NOT summarizing text. You are TEACHING.

Ask yourself: "If I had 5 minutes to teach this concept to a DAT student on a whiteboard, what would I write?"

Rules:
- Fill EVERY field completely. Never leave a field empty or null unless it is logically impossible for this concept.
- Write for a student who needs to PASS the DAT in 6 weeks, not one who needs a general overview.
- keyFacts: exactly the highest-yield facts. No fluff. No obvious statements. Each bullet is something that appears on the DAT.
- datPearl: one insight that exam writers love to hide in distractors. Not obvious. Specific.
- datPearlQuestions: 3 real DAT-style questions that test the pearl. Include a trap answer.
- commonTrap: the exact wrong answer students pick and why. Be specific.
- trapBreakdown: contrast the wrong mental model vs the correct one side by side.
- mechanism: explain WHY the concept works — causal chain, not a description.
- process: the step-by-step exam procedure — what a student DOES during the test to answer correctly.
- diagram: choose the type that teaches fastest. Prefer flow/table/comparison. Use "none" only if no diagram helps.
- formula: the exact formula a student must memorize. Include all variables.
- memoryTrick: a mnemonic, acronym, or story that sticks. Must be correct and memorable.
- datExample: an actual exam-level question with the reasoning for why the answer is correct.
- mistakes: specific errors students make on this topic, not generic advice.
- connections: real cross-subject DAT connections (Gen Chem ↔ Biochem ↔ Biology ↔ Orgo). Every concept connects somewhere.
- relatedTopics: 4-6 specific topics that appear on the same DAT section and connect to this one.

The study sheet should make a student think: "This is exactly what I needed. I can close this tab and answer DAT questions on this topic right now."`;

function buildUserPrompt(input: {
  concept: string;
  subjectArea: string;
  coreIdea?: string;
  anchors?: string[];
  pageText?: string;
}): string {
  const lines: string[] = [
    `CONCEPT: ${input.concept}`,
    `SUBJECT AREA: ${input.subjectArea}`,
  ];
  if (input.coreIdea) lines.push(`EXISTING CORE IDEA: ${input.coreIdea}`);
  if (input.anchors?.length) {
    lines.push(`KEY ANCHOR FACTS FROM THE SOURCE PAGE:`);
    input.anchors.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`));
  }
  if (input.pageText) {
    lines.push(`SOURCE PAGE TEXT (first 1200 chars):\n${input.pageText.slice(0, 1200)}`);
  }
  lines.push(
    "",
    "Generate a complete DAT study sheet for this concept. Fill every field. Do not leave anything generic.",
  );
  return lines.join("\n");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "HEAD") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!apiKey) return res.status(500).json({ error: "AI service is not configured for this deployment." });
  if (!FORMAT)  return res.status(500).json({ error: "Schema init failed" });

  const { concept, subjectArea, coreIdea, anchors, pageText, noteId } = req.body as {
    concept:     string;
    subjectArea: string;
    coreIdea?:   string;
    anchors?:    string[];
    pageText?:   string;
    noteId?:     string;
  };

  if (!concept || !subjectArea) {
    return res.status(400).json({ error: "concept and subjectArea are required" });
  }

  const clampedAnchors = Array.isArray(anchors) ? anchors.slice(0, 15) : anchors;

  DEV && console.log("[DAT_SHEET:start]", { noteId, concept, subjectArea, anchors: clampedAnchors?.length ?? 0 });

  try {
    const response = await openai.responses.parse({
      model:              "gpt-4o",
      max_output_tokens:  2000,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: buildUserPrompt({ concept, subjectArea, coreIdea, anchors: clampedAnchors, pageText }) },
      ],
      text: { format: FORMAT },
    });

    const sheet = response.output_parsed as DATStudySheet | null;
    if (!sheet) {
      DEV && console.error("[DAT_SHEET:null-output]", { noteId });
      return res.status(500).json({ error: "OpenAI returned null output" });
    }

    DEV && console.log("[DAT_SHEET:ok]", { noteId, concept: sheet.concept });
    return res.status(200).json({ sheet });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    DEV && console.error("[DAT_SHEET:error]", { noteId, error: msg });
    return res.status(500).json({ error: msg });
  }
}
