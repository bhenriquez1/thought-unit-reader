// pages/api/study-plan-diagnostic.ts
// Study Plan Lab — generates a ~30-question diagnostic test from the active
// book/document content, covering the whole selected book/chapter/unit (not
// just one page). Used to find what the student does not understand before
// building a weakness-driven study plan.
// SECURITY: OPENAI_API_KEY is server-side only, never sent to browser.

import type { NextApiRequest, NextApiResponse } from "next";
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

const SYSTEM_PROMPT = `You are an expert exam writer building a DIAGNOSTIC TEST — its purpose is to find what a student does NOT understand yet, not to confirm what they already know.

Cover the FULL range of the provided source material — spread questions across all sections/topics present, not just the beginning. Vary difficulty (mix of easy, medium, hard).

For each question:
- Write a clear question testable from the source material.
- Provide exactly 4 answer options, only one correct.
- "topic": a short (2-5 word) topic/concept label used to group weak areas later. Reuse the SAME topic label for multiple questions on the same concept so weaknesses can be aggregated.
- "page": if the source text includes "[PAGE n]" markers, set this to the page number nearest the tested content. Omit if unknown.
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

function buildUserPrompt(sourceText: string, bookTitle: string | undefined, chapterTitle: string | undefined, questionCount: number): string {
  let prompt = `Build a ${questionCount}-question diagnostic test`;
  if (chapterTitle) prompt += ` for: ${chapterTitle}`;
  if (bookTitle) prompt += ` (book: ${bookTitle})`;
  prompt += ".\n\n=== SOURCE MATERIAL ===\n\n";
  prompt += sourceText;
  prompt += `\n\n=== INSTRUCTION ===\nGenerate exactly ${questionCount} diagnostic questions covering the full range of the source material above. Return only the JSON object.`;
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
          { role: "user", content: buildUserPrompt(sourceText.slice(0, 60_000), bookTitle, chapterTitle, count) },
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

    console.log("[STUDYPLAN_DIAGNOSTIC_SUCCESS]", { count: questions.length, bookTitle, chapterTitle });
    res.status(200).json({ questions, provider: "openai" });
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
