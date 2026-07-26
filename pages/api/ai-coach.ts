// pages/api/ai-coach.ts
// AI Coach — personalized study coaching based on the student's progress context.
// Accepts a student question + lightweight context snapshot; returns a focused
// coaching response. Uses OpenAI gpt-4o (same key as other endpoints).

const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: "64kb" } },
};

const SYSTEM_PROMPT = `You are an expert academic coach helping a student prepare for a professional exam (e.g. DAT, MCAT, or a graduate-level course). You have access to a snapshot of their study progress.

Your job:
- Give specific, actionable advice tailored to THIS student's data — not generic tips.
- Be encouraging but honest. If they're behind, acknowledge it and give a realistic plan.
- Keep responses concise: 3-5 short paragraphs or a short bulleted list. Never lecture.
- Use plain language. No unnecessary jargon.
- When the student asks about a weak topic, give 2-3 concrete ways to approach it.
- Always end with one specific next action they can take right now.`;

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

export interface CoachContext {
  bookTitle: string;
  masteryPct: number;
  readPct: number;
  weakAreas: string[];
  nextTopic: string | null;
  currentPage: number;
  totalPages: number;
  todayTopics: string[];
}

interface RequestBody {
  question: string;
  context: CoachContext;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!apiKey) return res.status(503).json({ error: "AI service not configured" });

  const { question, context } = req.body as RequestBody;
  if (!question?.trim()) return res.status(400).json({ error: "question is required" });

  const contextBlock = [
    `Book: "${context.bookTitle || "Unknown"}"`,
    `Progress: ${Math.round(context.readPct)}% read, ${Math.round(context.masteryPct)}% mastered`,
    `Current page: ${context.currentPage} of ${context.totalPages}`,
    context.weakAreas.length > 0
      ? `Weak areas: ${context.weakAreas.slice(0, 5).join(", ")}`
      : "No weak areas identified yet",
    context.nextTopic ? `Recommended next topic: ${context.nextTopic}` : "",
    context.todayTopics.length > 0
      ? `Today's scheduled topics: ${context.todayTopics.slice(0, 3).join(", ")}`
      : "",
  ].filter(Boolean).join("\n");

  const userMessage = `STUDENT PROGRESS SNAPSHOT:\n${contextBlock}\n\nSTUDENT QUESTION:\n${question.trim()}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    res.status(200).json({ response: text });
  } catch (err: any) {
    DEV && console.error("[AI_COACH_ERROR]", err?.message || err);
    res.status(500).json({ error: "Coach unavailable. Please try again." });
  }
}
