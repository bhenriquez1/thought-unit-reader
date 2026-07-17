// pages/api/explainIt.ts
// "Explain It" — an office-hours-style study partner conversation about the
// current page/topic, as opposed to "Explain This Step" (pages/api/explainStep.ts)
// which is a terse micro-tutor for one selected sentence/equation. Explain It
// is allowed (and expected) to ask the student probing follow-up questions
// and grade their answers, the way a TA running office hours would.
//
// Provider order: OpenAI (primary) -> Anthropic Claude (fallback if no OpenAI key).

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ExplainItMessage,
  ExplainItStudyNotes,
  ExplainItNoteRef,
  ExplainItRecallRef,
  ExplainItStudyGuideRef,
} from "@/lib/explainIt/types";
import { getProfileSystemBlock } from "@/lib/learningProfile/profileContext";
import type { LearningProfile } from "@/types/workspace";

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: "512kb" } },
};

export interface ExplainItRequest {
  activeThoughtUnitText?: string;
  pageText?: string;
  pageThesis?: string | null;
  studyNotes?: ExplainItStudyNotes | null;
  conceptTitles?: string[];
  relatedNotes?: ExplainItNoteRef[];
  relatedRecallCards?: ExplainItRecallRef[];
  studyGuideSections?: ExplainItStudyGuideRef[];
  podcastOutline?: string[];
  seedSegmentText?: string;
  documentTitle?: string;
  pageNumber?: number;
  /** Active Learning Profile — frames how the tutor explains. */
  learningProfile?: LearningProfile;
  /** Full conversation so far (excluding system prompt) */
  messages: ExplainItMessage[];
}

export interface ExplainItResponse {
  reply: string;
  provider: "openai" | "anthropic";
  error?: string;
}

function buildSystemPrompt(body: ExplainItRequest): string {
  const notes = body.studyNotes;
  const noteLines = notes
    ? [
        notes.whyThisMatters && `Why this matters: ${notes.whyThisMatters}`,
        notes.keyMechanism && `Key mechanism: ${notes.keyMechanism}`,
        notes.commonConfusion && `Common confusion: ${notes.commonConfusion}`,
        notes.quickMemory && `Quick memory: ${notes.quickMemory}`,
        notes.reasoningFlow && `Reasoning flow: ${notes.reasoningFlow}`,
        notes.examSignal && `Exam signal: ${notes.examSignal}`,
      ].filter(Boolean).join("\n")
    : "";

  const noteRefLines = (body.relatedNotes || [])
    .slice(0, 4)
    .map((n) => `- "${n.topic}": ${n.coreIdea}`)
    .join("\n");

  const recallRefLines = (body.relatedRecallCards || [])
    .slice(0, 6)
    .map((c) => `- Q: ${c.front} / A: ${c.back}`)
    .join("\n");

  const studyGuideLines = (body.studyGuideSections || [])
    .slice(0, 2)
    .map((s) => `${s.chapterTitle}:\n${s.mustKnow.slice(0, 5).map((m) => `  - ${m}`).join("\n")}`)
    .join("\n");

  const podcastLines = (body.podcastOutline || []).slice(0, 8).map((l) => `- ${l}`).join("\n");

  const profileBlock = getProfileSystemBlock(body.learningProfile);

  return `${profileBlock}

You are "Explain It" — a study partner having an office-hours-style conversation with a student about the page/topic they're currently reading.

This is NOT "Explain This Step" (a quick one-line answer about a single selected sentence). Explain It is a real back-and-forth conversation about the broader page/topic: you discuss it, ask the student questions to check their understanding, and respond to what they actually say — the way a TA or study partner would during office hours, not the way a textbook would.

DOCUMENT: ${body.documentTitle ?? "(unknown)"}
PAGE: ${body.pageNumber ?? "unknown"}
PAGE THESIS: ${body.pageThesis ?? "(none)"}
${noteLines ? `\nRIGHT PANEL NOTES:\n${noteLines}\n` : ""}
${body.conceptTitles?.length ? `\nCONCEPT BLOCKS ON THIS PAGE: ${body.conceptTitles.join(", ")}\n` : ""}
${noteRefLines ? `\nSTUDENT'S OWN NOTELAB NOTES FOR THIS PAGE:\n${noteRefLines}\n` : ""}
${recallRefLines ? `\nSTUDENT'S OWN RECALLLAB CARDS FOR THIS PAGE:\n${recallRefLines}\n` : ""}
${studyGuideLines ? `\nSTUDY GUIDE LAB — MUST-KNOW POINTS FOR THIS BOOK:\n${studyGuideLines}\n` : ""}
${podcastLines ? `\nPODCAST LAB OUTLINE ALREADY GENERATED FOR THIS PAGE (the student may have just listened to this):\n${podcastLines}\n` : ""}
${body.seedSegmentText ? `\nTHE STUDENT WANTS TO DISCUSS THIS SPECIFIC PODCAST MOMENT:\n"""\n${body.seedSegmentText}\n"""\n` : ""}
${body.activeThoughtUnitText ? `CURRENTLY FOCUSED THOUGHT UNIT:\n"""\n${body.activeThoughtUnitText}\n"""\n` : ""}
CURRENT PAGE TEXT (for grounding):
"""
${(body.pageText || "").slice(0, 3500)}
"""

Rules:
- Talk like a study partner, not a report generator. Short, natural paragraphs — no rigid emoji section headers, no bullet-point dumps unless the student explicitly asks for a list.
- Be Socratic when it helps learning: after explaining a concept, it's often better to ask the student a short follow-up question ("Why do you think the equation needs to be balanced first?") instead of just lecturing. Wait for their answer before moving on.
- If the student answers a question you asked, grade it honestly and briefly (correct / partially correct / incorrect, with a one-line reason) before continuing the conversation.
- Ground everything in the actual page content, RightPanel notes, and the student's own notes/cards above — don't invent facts not supported by them.
- This is the FIRST message in the conversation if there is exactly one message in the history: open with a short, friendly framing of what's on this page/topic (1-3 sentences) and end with one open question to start the discussion, rather than a full lecture.
- Never mention "OpenAI", "Claude", or internal system/model names.
- Keep replies conversational length — usually 2-5 sentences, occasionally longer if walking through a worked example.`;
}

const VALID_PROFILES = new Set<string>(["standard", "dental", "medical", "surgeon", "dat"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse<ExplainItResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ reply: "", provider: "openai", error: "Method Not Allowed" });
  }

  const body = req.body as ExplainItRequest;
  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return res.status(400).json({ reply: "", provider: "openai", error: "messages is required" });
  }

  // Validate profile server-side; untrusted client values fall back to standard.
  if (body.learningProfile && !VALID_PROFILES.has(body.learningProfile)) {
    body.learningProfile = "standard";
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const systemPrompt = buildSystemPrompt(body);

  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...body.messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.ChatCompletionMessageParam),
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.5,
        max_tokens: 500,
      });
      const reply = completion.choices[0]?.message?.content?.trim() || "";

      if (reply) {
        console.log("[EXPLAIN_IT_DONE]", {
          page: body.pageNumber ?? null,
          provider: "openai",
          replyPreview: reply.slice(0, 100),
        });
        return res.status(200).json({ reply, provider: "openai" });
      }
    } catch (err: any) {
      console.error("[EXPLAIN_IT_OPENAI_ERROR]", err?.message ?? String(err));
      // fall through to Anthropic
    }
  }

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: systemPrompt,
        messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const reply = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
      console.log("[EXPLAIN_IT_DONE]", {
        page: body.pageNumber ?? null,
        provider: "anthropic",
        replyPreview: reply.slice(0, 100),
      });
      return res.status(200).json({ reply, provider: "anthropic" });
    } catch (err: any) {
      console.error("[EXPLAIN_IT_ANTHROPIC_ERROR]", err?.message ?? String(err));
      return res.status(502).json({ reply: "", provider: "anthropic", error: "Explanation provider failed" });
    }
  }

  return res.status(503).json({ reply: "", provider: "openai", error: "No explanation provider configured" });
}
