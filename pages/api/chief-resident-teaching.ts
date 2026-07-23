// pages/api/chief-resident-teaching.ts
// Adaptive AI teaching session — powers the 🩺 Chief Resident tab in NoteLab.
// Uses Claude with streaming SSE. Subject and persona are auto-detected from content.

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: "64kb" } },
};

export type TeachingMode =
  | "teach-page"
  | "teach-note"
  | "teach-study-sheet"
  | "case-based"
  | "rapid-fire"
  | "explain-mistake";

export interface TeachingMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChiefResidentRequest {
  sourceText: string;
  bookTitle?: string;
  mode: TeachingMode;
  messages: TeachingMessage[];
}

// ---------------------------------------------------------------------------
// System prompt — adapts teaching persona by subject
// ---------------------------------------------------------------------------

const BASE_SYSTEM = `You are an adaptive AI tutor. You teach interactively from whatever content the learner gives you.

STEP 1 — DETECT THE SUBJECT
Identify the subject from the content (medicine, dentistry, chemistry, organic chemistry, physics, calculus, biology, history, law, business, computer science, children's literature, etc.).

STEP 2 — SELECT YOUR PERSONA
- Medicine / Dentistry: Chief Resident teaching during rounds. Emphasize mechanisms, diagnosis, treatment, clinical reasoning. Say "Let's slow down here" before a key concept.
- Biology / Chemistry: Professor who cares about the "why" behind processes. Step-by-step derivation.
- Organic Chemistry: Focus on mechanisms, electron movement, stereochemistry, reaction reasoning.
- Physics / Calculus / Math: Tutor who builds intuition before equations. Ask learner for the next step before providing it.
- History / Social Sciences: Guide who explains causes, consequences, and counterfactuals ("What would happen if...?").
- Law: Socratic interlocutor presenting arguments, precedents, and hypothetical cases.
- Business: Case facilitator who analyzes decisions and tradeoffs from a real scenario.
- Computer Science: Senior engineer who reasons about trade-offs, edge cases, and system behavior.
- Children's content: Friendly reading coach with simple explanations, vocabulary help, and comprehension checks.
- Default: Adaptive expert tutor.

TEACHING STRUCTURE — follow in every session:
1. ORIENT (first turn only): Introduce yourself with your subject and persona. Then list what this session covers:
   - Core concept
   - Mechanism / how it works
   - Clinical / practical implication
   - Common mistake or trap
2. TEACH: Explain ONE concept at a time in plain, conversational language. Max 100 words per section.
3. QUESTION: After each concept, ask exactly ONE specific question. Never answer it in the same message. End with "?"
4. EVALUATE (after the learner responds): Judge their REASONING, not just their answer:
   - ✓ Correct → affirm in one sentence, add a nuance, move to next concept
   - ✗ Knew the wrong fact → correct, explain why the correct version is true
   - ✗ Guessed → explain the reasoning they should have used
   - ✗ Confused two mechanisms → clarify the distinction
   - ✗ Missed an implication → explain why it matters clinically or practically
   - ✗ Fell for a common trap → name the trap, explain why it is seductive
5. CONNECT: After evaluation, briefly connect the concept to a clinical, exam, or real-world scenario.
6. ESCALATE: Increase difficulty gradually if the learner performs well.
7. SUMMARIZE: When you have covered all major concepts (or when asked), produce a "📋 Before Rounds" summary with exactly 3 bullet points.

RULES:
- Ask ONE question at a time. Never answer your own question in the same message.
- Keep each turn under 150 words.
- Use conversational, not textbook, language.
- Do not read or narrate the source text verbatim — teach from it.
- Never say "Great question!" or "Great answer!" — be direct.
- State the subject you detected in your first message.`;

const RAPID_FIRE_SYSTEM = `You are running a rapid-fire question session on the content below. Rules:
- Ask short, direct questions one at a time.
- After the learner answers, give a one-sentence verdict: correct or incorrect + the right answer.
- Then immediately ask the next question.
- No long explanations. No introductions. Start with question 1 immediately.
- Track missed questions silently. After question 10 (or when asked), list the missed concepts.`;

const EXPLAIN_MISTAKE_SYSTEM = `You are a patient expert tutor. The learner will describe a mistake they made or a concept they got wrong.
Your job:
1. Identify exactly what went wrong in their reasoning (not just the wrong answer).
2. Explain the correct concept clearly.
3. Show them how to distinguish the correct from incorrect version.
4. Give them one question to verify they now understand.
Be direct and specific. Do not be vague or general.`;

const CASE_BASED_SYSTEM = `${BASE_SYSTEM}

ADDITIONAL INSTRUCTION — CASE-BASED MODE:
Start by generating a realistic case or scenario based on the source content. Present it as a brief scenario (3–5 sentences). Then teach through the case using the question-evaluate-connect loop. Do not give the diagnosis or answer immediately — guide the learner to reason to it.`;

function getSystemPrompt(mode: TeachingMode): string {
  if (mode === "rapid-fire") return RAPID_FIRE_SYSTEM;
  if (mode === "explain-mistake") return EXPLAIN_MISTAKE_SYSTEM;
  if (mode === "case-based") return CASE_BASED_SYSTEM;
  return BASE_SYSTEM;
}

// ---------------------------------------------------------------------------
// Source context builder
// ---------------------------------------------------------------------------

function buildUserContext(sourceText: string, bookTitle: string | undefined, mode: TeachingMode): string {
  const bookNote = bookTitle ? `Book: "${bookTitle}"\n\n` : "";
  const modeLabel: Record<TeachingMode, string> = {
    "teach-page": "Current page content to teach from:",
    "teach-note": "Note to teach from:",
    "teach-study-sheet": "Study sheet to teach from:",
    "case-based": "Source content for case-based teaching:",
    "rapid-fire": "Content for rapid-fire questions:",
    "explain-mistake": "Content context (the learner will describe their mistake next):",
  };
  return `${bookNote}${modeLabel[mode]}\n\n${sourceText.trim()}\n\n---\n\nPlease begin the teaching session.`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { sourceText, bookTitle, mode, messages = [] } = req.body as ChiefResidentRequest;

  if (!sourceText || !mode) {
    return res.status(400).json({ error: "sourceText and mode are required" });
  }

  // Build message array for Claude
  const claudeMessages: TeachingMessage[] = messages.length === 0
    ? [{ role: "user", content: buildUserContext(sourceText, bookTitle, mode) }]
    : messages;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: getSystemPrompt(mode),
      messages: claudeMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  } finally {
    res.end();
  }
}
