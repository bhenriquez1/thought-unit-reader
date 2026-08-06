// pages/api/recall-coach.ts
// Recall 2.0 AI Coach — triggered after a student gets 5+ cards wrong in a row.
// Returns a focused explanation of the struggling concept, a common-mistake callout,
// and a single re-engagement question.
//
// Provider order: OpenAI (primary) → Anthropic (fallback).
// Security: all user-supplied values go into messages only — system prompt is static.

const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { RecallCategory } from "@/lib/recalllab/recall2Types";

export const config = {
  maxDuration: 25,
  api: { bodyParser: { sizeLimit: "128kb" } },
};

export interface RecallCoachRequest {
  /** Cards the student just failed — front + back only */
  strugglingCards: Array<{ front: string; back: string; category: RecallCategory }>;
  /** Short topic label for context */
  topic?: string;
  bookTitle?: string;
  pageNumber?: number;
}

export interface RecallCoachResponse {
  coachMessage: string;
  provider: "openai" | "anthropic";
  error?: string;
}

const SYSTEM_PROMPT = `You are an expert study coach embedded in a flashcard app. A student just missed several cards in a row and needs targeted help — not a lecture, just a brief, supportive intervention.

Respond in this exact format (use these emoji headers, omit any that don't apply):

🎯 The Core Idea — 2-3 sentences. Explain the concept from a completely different angle than a textbook would. Be concrete and direct.
⚠️ The Trap — 1 sentence on the specific misconception that causes students to miss this. Start with "Students often confuse..." or "The common mistake is..."
💡 Memory Hook — 1 sentence. A memorable analogy, acronym, or mental image.
🔁 Try Again — One short question for the student to attempt right now. Phrase it slightly differently than the original card.

Rules:
- Maximum 120 words total.
- Never say "I" or refer to yourself.
- Never mention OpenAI, Claude, or the app name.
- Be warm and direct — like a tutor in office hours, not a textbook.`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RecallCoachResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ coachMessage: "", provider: "openai", error: "Method Not Allowed" });
  }

  const body = req.body as RecallCoachRequest;
  if (!Array.isArray(body?.strugglingCards) || body.strugglingCards.length === 0) {
    return res.status(400).json({ coachMessage: "", provider: "openai", error: "strugglingCards required" });
  }

  // Build the user message from struggling cards (user-controlled data — in messages only)
  const cardLines = body.strugglingCards.slice(0, 5).map((c, i) =>
    `Card ${i + 1} [${c.category}]:\n  Q: ${c.front.slice(0, 150)}\n  A: ${c.back.slice(0, 200)}`,
  ).join("\n\n");

  const userMsg = [
    body.bookTitle    ? `Book: ${body.bookTitle}` : null,
    body.topic        ? `Topic: ${body.topic}` : null,
    body.pageNumber   ? `Page: ${body.pageNumber}` : null,
    `\nStruggling cards:\n${cardLines}`,
    `\nFocus on the most important card above. Help the student understand it.`,
  ].filter(Boolean).join("\n");

  const openaiKey    = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.CLAUDE_API_KEY;

  if (openaiKey) {
    try {
      const openai     = new OpenAI({ apiKey: openaiKey });
      const completion = await openai.chat.completions.create({
        model:       "gpt-4o-mini",
        temperature: 0.4,
        max_tokens:  220,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userMsg },
        ],
      });
      const coachMessage = completion.choices[0]?.message?.content?.trim() ?? "";
      if (coachMessage) {
        DEV && console.log("[RECALL_COACH_DONE]", { provider: "openai", cardCount: body.strugglingCards.length });
        return res.status(200).json({ coachMessage, provider: "openai" });
      }
    } catch (err) {
      DEV && console.error("[RECALL_COACH_OPENAI_ERROR]", err instanceof Error ? err.message : String(err));
    }
  }

  if (anthropicKey) {
    try {
      const client  = new Anthropic({ apiKey: anthropicKey });
      const message = await client.messages.create({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 220,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: "user", content: userMsg }],
      }) as Anthropic.Message;
      const coachMessage = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
      DEV && console.log("[RECALL_COACH_DONE]", { provider: "anthropic", cardCount: body.strugglingCards.length });
      return res.status(200).json({ coachMessage, provider: "anthropic" });
    } catch (err) {
      DEV && console.error("[RECALL_COACH_ANTHROPIC_ERROR]", err instanceof Error ? err.message : String(err));
    }
  }

  return res.status(503).json({ coachMessage: "", provider: "openai", error: "No AI provider configured" });
}
