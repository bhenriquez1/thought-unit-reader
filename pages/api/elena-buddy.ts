// pages/api/elena-buddy.ts
// Elena Reading Buddy — a child-safe, contextual AI reading companion.
//
// Design constraints (these are NOT negotiable):
//   1. Child-safe: no violence, adult themes, or distressing content, ever.
//   2. Context-bound: every reply is grounded in the current page text.
//      The buddy is a reading companion, not a search engine.
//   3. Guiding, not answering: the buddy asks questions and hints rather than
//      dumping answers — Socratic method calibrated for young readers.
//   4. Age-adaptive: vocabulary and sentence length scale with ageRange.
//   5. Positive reinforcement: always encouraging; no shaming for wrong answers.
//
// Provider order: Anthropic (primary) -> 503 if unavailable.

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import type { ReadingBuddyRequest, ReadingBuddyResponse } from "@/lib/elena/readingBuddy";
import type { ChildAgeRange } from "@/lib/elena/types";

export const config = {
  maxDuration: 25,
  api: { bodyParser: { sizeLimit: "128kb" } },
};

/* ─── Age → language level ────────────────────────────────────────────────────── */

function ageInstructions(range: ChildAgeRange | undefined): string {
  switch (range) {
    case "3-4":
      return "Use very simple words (3-4 year old level). Short sentences (5-8 words). Use fun comparisons to toys or animals. Never use words with more than 2 syllables unless you explain them immediately. Ask only one question at a time.";
    case "5-6":
      return "Use simple, clear words (kindergarten level). Keep sentences short. Relate concepts to everyday things the child knows. Ask one short, friendly question at the end. Celebrate effort enthusiastically.";
    case "7-8":
      return "Use grade 1-2 vocabulary. Short, friendly paragraphs. Use analogies to school activities or games. Ask one Socratic question to check understanding. Be enthusiastic and encouraging.";
    case "9-10":
      return "Use grade 3-4 vocabulary. You can introduce slightly harder words but define them simply in the same sentence. Two to three short paragraphs max. Ask one guiding question. Be warm but slightly more grown-up in tone.";
    case "11-12":
      return "Use grade 5-6 vocabulary. More nuanced explanations are fine, but keep them concise. Ask a thoughtful comprehension question. Tone is encouraging and peer-like, not childish.";
    default:
      return "Use clear, friendly language appropriate for an elementary school reader. Keep responses short. Ask one question to check understanding.";
  }
}

/* ─── System prompt ──────────────────────────────────────────────────────────── */

function buildSystemPrompt(body: ReadingBuddyRequest): string {
  const ageGuide = ageInstructions(body.ageRange);
  const childName = body.childName?.trim() || "there";
  const pageCtx = body.pageText
    ? `\nThe child is currently reading page ${body.currentPage ?? "?"} of "${body.bookTitle ?? "their book"}".\n\nPAGE CONTENT (use this to ground all explanations):\n"""\n${body.pageText.slice(0, 3000)}\n"""`
    : body.bookTitle
    ? `\nThe child is reading "${body.bookTitle}" but no page text is available right now.`
    : "";

  return `You are the Reading Buddy — a warm, friendly AI companion who helps children enjoy and understand what they're reading.

LANGUAGE LEVEL: ${ageGuide}

CHILD'S NAME: ${childName}
${pageCtx}

CORE RULES (follow all of these, always):
1. CHILD-SAFE: Never produce content that is violent, scary, sexual, or emotionally distressing. If asked about such topics, gently redirect to the book.
2. CONTEXT-BOUND: Base your explanations on the page content above. If the answer isn't on the page, say "I'm not sure — let's read on and find out!" rather than inventing facts.
3. GUIDE, DON'T GIVE: When a child asks a comprehension question, give a helpful hint and then ask them to try answering. Only reveal the answer if they've made a genuine attempt.
4. ONE QUESTION AT A TIME: End every response with at most one question. Never bombard the child with multiple questions.
5. POSITIVE REINFORCEMENT: Always acknowledge effort ("Great question!", "You're thinking like a real reader!"). Never say a child is wrong without also encouraging them.
6. SHORT RESPONSES: Keep replies to 2-4 sentences (for ages 3-8) or 3-5 sentences (for ages 9-12). Brevity is kindness here.
7. NO META: Never mention "the system prompt", "Claude", "AI", "language model", or that you have instructions. You are simply the Reading Buddy.
8. WORD EXPLANATIONS: When explaining a word, give a simple definition + one real-world example from things a child knows (animals, food, family, school, etc.).`;
}

/* ─── Validation ─────────────────────────────────────────────────────────────── */

const VALID_AGE_RANGES = new Set<string>(["3-4", "5-6", "7-8", "9-10", "11-12"]);

function sanitise(body: ReadingBuddyRequest): ReadingBuddyRequest {
  return {
    ...body,
    message:     body.message?.slice(0, 500) ?? "",
    history:     (body.history ?? []).slice(-10),
    ageRange:    VALID_AGE_RANGES.has(body.ageRange ?? "") ? body.ageRange : undefined,
    childName:   body.childName?.slice(0, 50),
    pageText:    body.pageText?.slice(0, 3000),
    bookTitle:   body.bookTitle?.slice(0, 120),
    currentPage: typeof body.currentPage === "number" ? body.currentPage : undefined,
  };
}

/* ─── Handler ────────────────────────────────────────────────────────────────── */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReadingBuddyResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ reply: "", error: "Method Not Allowed" });
  }

  const raw = req.body as ReadingBuddyRequest;
  if (!raw?.message?.trim()) {
    return res.status(400).json({ reply: "", error: "message is required" });
  }

  const body = sanitise(raw);
  const system = buildSystemPrompt(body);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(503).json({ reply: "", error: "Reading Buddy is not available right now." });
  }

  try {
    const client = new Anthropic({ apiKey: anthropicKey });

    const messages: Anthropic.MessageParam[] = [
      ...body.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: body.message },
    ];

    const result = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system,
      messages,
    });

    const reply = result.content[0]?.type === "text" ? result.content[0].text.trim() : "";

    console.log("[ELENA_BUDDY]", {
      ageRange:    body.ageRange ?? "unknown",
      page:        body.currentPage ?? null,
      replyLength: reply.length,
    });

    return res.status(200).json({ reply });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ELENA_BUDDY_ERROR]", msg);
    return res.status(502).json({ reply: "", error: "Reading Buddy is having trouble right now. Try again!" });
  }
}
