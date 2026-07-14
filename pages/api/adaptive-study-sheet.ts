// pages/api/adaptive-study-sheet.ts
// Adaptive Study Sheet Generator — profile-driven, domain-aware.
// Generates a visual study sheet whose sections are determined by the active ExpertProfile,
// not a hardcoded DAT template.
// Input: concept + subjectArea + optional profileId + canonical source passages.
// Output: AdaptiveStudySheet validated by Zod structured output.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { AdaptiveStudySheetSchema, type AdaptiveStudySheet } from "@/lib/notelab/adaptiveStudySheet";
import {
  STUDY_SHEET_PROFILES,
  profileFromSubject,
  type ProfileId,
} from "@/lib/notelab/studySheetProfiles";

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: "1mb" } },
};

const apiKey = process.env.OPENAI_API_KEY;
const openai  = new OpenAI({ apiKey });

let FORMAT: ReturnType<typeof zodTextFormat> | null = null;
try {
  FORMAT = zodTextFormat(AdaptiveStudySheetSchema, "adaptive_study_sheet");
} catch (e) {
  console.error("[ADAPTIVE_SHEET:init:SCHEMA_FAIL]", e instanceof Error ? e.message : String(e));
}

// ── Universal system prompt ────────────────────────────────────────────────

const UNIVERSAL_SYSTEM = `You are an expert educator building a one-concept visual study sheet.

You are TEACHING, not summarizing.

Ask yourself: "If I had 5 minutes to teach this concept to a student on a whiteboard, what would I write?"

Core rules:
- Generate ONLY the sections listed in the profile. Do not invent additional sections.
- Leave formula / diagram / practiceQuestions null unless the profile explicitly requests them.
- coreIdea: exactly ONE sentence — the governing principle in plain language.
- sections: one entry per profile section, in the order listed. Required sections must be filled completely; optional sections may be left with brief content if genuinely not applicable, but never invented.
- Never write filler. If a section cannot be meaningfully answered for this concept, write a short honest statement of why and keep it brief.
- For each section: if a relevant canonical anchor is provided, set anchorId to the matching "anchor_N" string and sourceText to the verbatim passage from that anchor.
- connections: genuine cross-subject links only. Leave null if no real connection exists.
- relatedTopics: 4-6 specific topics the student should also study.`;

// ── Prompt builder ─────────────────────────────────────────────────────────

interface PromptInput {
  concept:          string;
  subjectArea:      string;
  profileId:        ProfileId;
  canonicalAnchors?: Array<{ text: string; anchorType: string; reason: string }>;
  pageThesis?:       string;
  sourcePage?:       number;
  noteId?:           string;
}

function buildPrompts(input: PromptInput): { system: string; user: string } {
  const profile = STUDY_SHEET_PROFILES[input.profileId];

  const sectionList = profile.sections
    .map((s, i) =>
      `  ${i + 1}. ${s.icon} ${s.label}${s.required ? " (required)" : " (include if relevant)"}: ${s.description}`
    )
    .join("\n");

  const profileBlock = [
    `\n── PROFILE: ${profile.label} (${profile.id}) ──`,
    `DOCUMENT TYPE: ${profile.documentType}`,
    `SHEET STYLE: ${profile.sheetStyle}`,
    `\nSECTIONS TO GENERATE (in this exact order):\n${sectionList}`,
    profile.hasFormula
      ? "\nFORMULA: Required. Include the key formula with all variables defined."
      : "\nFORMULA: Set to null — not applicable for this profile.",
    profile.hasDiagram
      ? "\nDIAGRAM: Include if a visual diagram would meaningfully help understanding. Choose the most useful type."
      : "\nDIAGRAM: Set to null — not applicable for this profile.",
    profile.hasPracticeQuestions
      ? "\nPRACTICE QUESTIONS: Generate exactly 3 exam-quality questions that test real understanding."
      : "\nPRACTICE QUESTIONS: Set to null — not applicable for this profile.",
    profile.systemPromptAddendum ? `\n${profile.systemPromptAddendum}` : "",
  ].join("\n");

  const system = UNIVERSAL_SYSTEM + profileBlock;

  // ── User prompt ──────────────────────────────────────────────────────────
  const lines: string[] = [
    `CONCEPT: ${input.concept}`,
    `SUBJECT AREA: ${input.subjectArea}`,
    `ACTIVE PROFILE: ${input.profileId}`,
  ];

  if (input.pageThesis) {
    lines.push(`\nPAGE THESIS (the governing idea of the source page):\n${input.pageThesis}`);
  }

  if (input.canonicalAnchors?.length) {
    lines.push(
      `\nCANONICAL SOURCE PASSAGES (use these as your primary source; reference anchorId where possible):`,
    );
    input.canonicalAnchors.forEach((a, i) => {
      lines.push(`  [anchor_${i}] [type: ${a.anchorType}] "${a.text}"`);
      if (a.reason) lines.push(`           Importance: ${a.reason}`);
    });
    lines.push(`\nFor each section, set anchorId to the most relevant "anchor_N" above.`);
    lines.push(`Set sourceText to the verbatim passage from that anchor that supports the section.`);
  }

  if (input.sourcePage !== undefined) {
    lines.push(`\nSOURCE PAGE: ${input.sourcePage}`);
    lines.push(`Set canonicalSourcePage = ${input.sourcePage}.`);
  }

  lines.push(
    `\nGenerate a complete ${profile.label} study sheet for "${input.concept}".`,
    `Fill every required section. Do not leave profileId, documentType, sheetStyle, concept, subjectArea, or coreIdea empty.`,
  );

  return { system, user: lines.join("\n") };
}

// ── Handler ───────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "HEAD") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!apiKey)  return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  if (!FORMAT)  return res.status(500).json({ error: "Schema init failed" });

  const {
    concept,
    subjectArea,
    profileId: rawProfileId,
    canonicalAnchors,
    pageThesis,
    sourcePage,
    noteId,
  } = req.body as {
    concept:           string;
    subjectArea:       string;
    profileId?:        string;
    canonicalAnchors?: Array<{ text: string; anchorType: string; reason: string }>;
    pageThesis?:       string;
    sourcePage?:       number;
    noteId?:           string;
  };

  if (!concept || !subjectArea) {
    return res.status(400).json({ error: "concept and subjectArea are required" });
  }

  const profileId: ProfileId =
    rawProfileId && rawProfileId in STUDY_SHEET_PROFILES
      ? (rawProfileId as ProfileId)
      : profileFromSubject(subjectArea);

  console.log("[ADAPTIVE_SHEET:start]", {
    noteId,
    concept,
    subjectArea,
    profileId,
    anchors: canonicalAnchors?.length ?? 0,
    hasThesis: !!pageThesis,
  });

  const { system, user } = buildPrompts({
    concept,
    subjectArea,
    profileId,
    canonicalAnchors,
    pageThesis,
    sourcePage,
    noteId,
  });

  try {
    const response = await openai.responses.parse({
      model:             "gpt-4o",
      max_output_tokens: 2500,
      input: [
        { role: "system", content: system },
        { role: "user",   content: user },
      ],
      text: { format: FORMAT },
    });

    const sheet = response.output_parsed as AdaptiveStudySheet | null;
    if (!sheet) {
      console.error("[ADAPTIVE_SHEET:null-output]", { noteId });
      return res.status(500).json({ error: "OpenAI returned null output" });
    }

    console.log("[ADAPTIVE_SHEET:ok]", {
      noteId,
      concept:  sheet.concept,
      profileId: sheet.profileId,
      sections: sheet.sections.length,
    });
    return res.status(200).json({ sheet });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADAPTIVE_SHEET:error]", { noteId, error: msg });
    return res.status(500).json({ error: msg });
  }
}
