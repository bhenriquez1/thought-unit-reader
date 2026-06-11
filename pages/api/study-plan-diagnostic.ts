// pages/api/study-plan-diagnostic.ts
// Study Plan Lab — generates a ~30-question diagnostic test from the active
// book/document content, covering the whole selected book/chapter/unit (not
// just one page). Used to find what the student does not understand before
// building a weakness-driven study plan.
//
// Two-stage AI pipeline:
//   Stage 1 (Claude, optional) — reads the FULL source text (large context
//     window) and produces a topic map spanning the entire document, so
//     coverage isn't biased toward the first few pages.
//   Stage 2 (OpenAI, required) — writes the actual diagnostic questions as
//     strict JSON, grounded in the topic map (when available) and source
//     excerpts.
// If ANTHROPIC_API_KEY is missing, Stage 1 is skipped and Stage 2 runs alone
// (same behavior as before).
// SECURITY: API keys are server-side only, never sent to the browser.

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import type { DiagnosticQuestion } from "@/lib/studyplan/types";

export const config = {
  maxDuration: 90,
  api: { bodyParser: { sizeLimit: "4mb" } },
};

type RequestBody = {
  bookTitle?: string;
  chapterTitle?: string;
  sourceText: string;     // aggregated book/chapter text (already trimmed by caller)
  questionCount?: number;  // default 30
};

type RawQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  topic: string;
  page?: number;
  explanation: string;
};

const OUTLINE_SYSTEM_PROMPT = `You are an expert curriculum analyst. Read the provided book/chapter content — it may include "[PAGE n]" markers — and produce a TOPIC MAP covering the ENTIRE document, not just the beginning.

For each major topic or concept, output one line in this exact format:
TOPIC: <2-5 word topic name> | PAGES: <comma-separated page numbers, or "?" if unknown> | <one-sentence description of what is taught>

Aim for 10-25 topics, spread evenly across the full document. Output plain text only — no markdown, no JSON, no commentary.`;

const SYSTEM_PROMPT = `You are an expert exam writer building a DIAGNOSTIC TEST — its purpose is to find what a student does NOT understand yet, not to confirm what they already know.

Cover the FULL range of the provided source material — spread questions across all sections/topics present, not just the beginning. Vary difficulty (mix of easy, medium, hard).

If a TOPIC MAP is provided, use it to ensure your questions span every topic listed (not just the first few) — it was built from the complete document, including sections that may be excerpted or truncated in the source material below.

For each question:
- Write a clear question testable from the source material.
- Provide exactly 4 answer options, only one correct.
- "topic": a short (2-5 word) topic/concept label used to group weak areas later. Reuse the SAME topic label for multiple questions on the same concept so weaknesses can be aggregated. If a TOPIC MAP is provided, prefer reusing its topic names.
- "page": if the source text includes "[PAGE n]" markers, set this to the page number nearest the tested content. Otherwise use the PAGES from the matching TOPIC MAP entry if available. Omit if unknown.
- "explanation": 1-2 sentences explaining the correct answer.

OUTPUT FORMAT — return ONLY valid JSON matching this exact schema:
{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctIndex": 0,
      "topic": "string",
      "page": 12,
      "explanation": "string"
    }
  ]
}
Return ONLY the JSON object — no markdown fences, no explanation outside the JSON.`;

/** Stage 1 — Claude reads the full source text and builds a whole-document
 *  topic map. Returns null if ANTHROPIC_API_KEY is unset or the call fails;
 *  callers must treat this as optional. */
async function buildTopicOutline(sourceText: string, bookTitle?: string, chapterTitle?: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: [{ type: "text", text: OUTLINE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `BOOK: ${bookTitle || "Unknown"}\nCHAPTER/UNIT: ${chapterTitle || "Unknown"}\n\n${sourceText}`,
      }],
    } as Parameters<typeof client.messages.create>[0]);

    const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    if (!raw) return null;

    console.log("[STUDYPLAN_DIAGNOSTIC_CLAUDE_OUTLINE]", {
      lines: raw.split("\n").filter(l => l.trim()).length,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    });
    return raw;
  } catch (e) {
    console.error("[STUDYPLAN_DIAGNOSTIC_CLAUDE_OUTLINE_ERROR]", String(e));
    return null;
  }
}

function buildUserPrompt(sourceText: string, bookTitle: string | undefined, chapterTitle: string | undefined, questionCount: number, topicOutline: string | null): string {
  let prompt = `Build a ${questionCount}-question diagnostic test`;
  if (chapterTitle) prompt += ` for: ${chapterTitle}`;
  if (bookTitle) prompt += ` (book: ${bookTitle})`;
  prompt += ".\n\n";
  if (topicOutline) {
    prompt += `=== TOPIC MAP (covers the full document) ===\n${topicOutline}\n\n`;
  }
  prompt += "=== SOURCE MATERIAL ===\n\n";
  prompt += sourceText;
  prompt += `\n\n=== INSTRUCTION ===\nGenerate exactly ${questionCount} diagnostic questions`;
  prompt += topicOutline
    ? ", spreading them across every topic in the TOPIC MAP above."
    : " covering the full range of the source material above.";
  prompt += " Return only the JSON object.";
  return prompt;
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeQuestions(raw: unknown, fallbackCount: number): DiagnosticQuestion[] {
  const arr = Array.isArray((raw as any)?.questions) ? (raw as any).questions as RawQuestion[] : [];
  const out: DiagnosticQuestion[] = [];
  for (const q of arr) {
    if (!q || typeof q.question !== "string") continue;
    const options = Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === "string") : [];
    if (options.length !== 4) continue;
    const correctIndex = Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4 ? q.correctIndex : 0;
    out.push({
      id: genId("dq"),
      question: q.question,
      options,
      correctIndex,
      topic: typeof q.topic === "string" && q.topic.trim() ? q.topic.trim() : "General",
      page: typeof q.page === "number" ? q.page : undefined,
      explanation: typeof q.explanation === "string" ? q.explanation : "",
    });
  }
  return out.slice(0, Math.max(fallbackCount, 1));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { sourceText, bookTitle, chapterTitle, questionCount } = req.body as RequestBody;
  const count = Math.min(Math.max(questionCount ?? 30, 5), 40);

  if (!sourceText || !sourceText.trim()) {
    res.status(400).json({ error: "Source text is required to generate a diagnostic." });
    return;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("[STUDYPLAN_DIAGNOSTIC_API] OPENAI_API_KEY not set");
    res.status(200).json({ questions: [], provider: "fallback", error: "API key not configured" });
    return;
  }

  // Stage 1 (optional) — Claude reads up to ~150k chars to map topics across
  // the whole document, so Stage 2's coverage isn't biased toward the part of
  // sourceText that survives the 60k-char cap below.
  const topicOutline = await buildTopicOutline(sourceText.slice(0, 150_000), bookTitle, chapterTitle);

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 80_000);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      signal: ctrl.signal,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(sourceText.slice(0, 60_000), bookTitle, chapterTitle, count, topicOutline) },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("[STUDYPLAN_DIAGNOSTIC_API] OpenAI error:", resp.status, errText.slice(0, 200));
      res.status(200).json({ questions: [], provider: "fallback", error: `OpenAI ${resp.status}` });
      return;
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[STUDYPLAN_DIAGNOSTIC_API] JSON parse failed:", raw.slice(0, 200));
      res.status(200).json({ questions: [], provider: "fallback", error: "JSON parse failed" });
      return;
    }

    const questions = normalizeQuestions(parsed, count);
    if (questions.length === 0) {
      res.status(200).json({ questions: [], provider: "fallback", error: "No valid questions returned" });
      return;
    }

    const provider = topicOutline ? "openai+claude" : "openai";
    console.log("[STUDYPLAN_DIAGNOSTIC_SUCCESS]", { count: questions.length, bookTitle, chapterTitle, provider });
    res.status(200).json({ questions, provider });
  } catch (err) {
    clearTimeout(timeout);
    const isAbort = (err as Error)?.name === "AbortError";
    console.error("[STUDYPLAN_DIAGNOSTIC_API]", isAbort ? "timeout" : "error", String(err));
    res.status(200).json({
      questions: [],
      provider: "fallback",
      error: isAbort ? "Request timed out — try with a smaller chapter/section" : String(err),
    });
  }
}
