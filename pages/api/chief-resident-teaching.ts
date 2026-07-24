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
  | "explain-mistake"
  | "explain-text"
  | "explain-page";

export type TeachingAudience =
  | "beginner"
  | "dental-student"
  | "dentist"
  | "oral-surgeon"
  | "dat"
  | "board-review"
  | "child";

export interface TeachingMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChiefResidentRequest {
  sourceText: string;
  bookTitle?: string;
  mode: TeachingMode;
  audience?: TeachingAudience;
  messages: TeachingMessage[];
  /** For explain-text mode: the highlighted/selected passage */
  selectedText?: string;
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

const EXPLAIN_TEXT_SYSTEM = `You are a clinical tutor. A student has highlighted a passage from their reading and wants you to explain it deeply.

APPROACH (follow in this order):
1. Identify the CORE CONCEPT — what is this passage actually saying, stripped of jargon?
2. Explain WHY it works this way — mechanism, not just definition. What forces, rules, or principles are at play?
3. Name ONE common mistake students make with this concept and explain why the wrong version is seductive.
4. Give ONE clinical or real-world anchor that makes this stick ("this is why patients with X present with Y").
5. Ask one reasoning question (not a recall question) to check if they truly understood.

Rules:
- Keep the first response under 200 words.
- Be direct. Don't summarize or paraphrase the selected text verbatim — teach from it.
- Do NOT start with "Great selection!" or "Sure!" Just begin with the core concept.
- After the student answers your question, evaluate their REASONING and either go deeper or correct the misconception.`;

const EXPLAIN_PAGE_SYSTEM = `You are a study partner having an office-hours conversation about a page from a textbook.

APPROACH:
- Open with 2–3 sentences framing what this page is really about (the thesis or main idea — not a summary of the content)
- End your opening with exactly ONE discussion question that probes reasoning (not recall): "Why do you think..." or "What would happen if..." — not "What is..."
- After the student answers: grade their reasoning honestly and briefly (correct / partially correct / incorrect, with one sentence explaining why), then build on their response
- As the conversation deepens: introduce clinical/exam implications, add nuance, and surface the one trap most students fall for on this topic

Rules:
- Keep each response to 2–5 short conversational sentences, occasionally longer for a worked example.
- Be Socratic: a well-placed question teaches more than a 10-bullet lecture.
- Do NOT start with "Great question!" or "Interesting!" Just respond directly.
- Ground all explanations in the source content provided.`;

const AUDIENCE_MODIFIERS: Record<string, string> = {
  "beginner": "\n\nAUDIENCE: The learner is a complete beginner. Use very simple language, build from first principles, and define any jargon before using it.",
  "dental-student": "\n\nAUDIENCE: The learner is a dental student in pre-clinical years. Connect concepts to dentistry when relevant. Emphasize mechanisms that appear on the DAT and in dental boards.",
  "dentist": "\n\nAUDIENCE: The learner is a licensed dentist refreshing knowledge. Use clinical terminology freely. Focus on practical applications, clinical pearls, and evidence-based nuances.",
  "oral-surgeon": "\n\nAUDIENCE: The learner is an oral surgeon or advanced specialist. Use highly technical language. Focus on mechanisms, edge cases, complications, and evidence-based distinctions.",
  "dat": "\n\nAUDIENCE: The learner is preparing for the DAT exam. Focus on what is high-yield for the DAT: common question patterns, traps, mechanisms the ADA tests, and memory anchors that survive exam-day pressure.",
  "board-review": "\n\nAUDIENCE: The learner is doing board exam review. Focus on high-yield algorithms, reasoning patterns, and the concepts most commonly tested on boards.",
  "child": "\n\nAUDIENCE: The learner is a young child (ages 8–12). Use very simple, friendly language. Draw analogies to everyday things they know. Short sentences. Make it fun and encouraging.",
};

function getSystemPrompt(mode: TeachingMode, audience?: string): string {
  let base: string;
  if (mode === "rapid-fire") base = RAPID_FIRE_SYSTEM;
  else if (mode === "explain-mistake") base = EXPLAIN_MISTAKE_SYSTEM;
  else if (mode === "case-based") base = CASE_BASED_SYSTEM;
  else if (mode === "explain-text") base = EXPLAIN_TEXT_SYSTEM;
  else if (mode === "explain-page") base = EXPLAIN_PAGE_SYSTEM;
  else base = BASE_SYSTEM;
  if (audience && AUDIENCE_MODIFIERS[audience]) base += AUDIENCE_MODIFIERS[audience];
  return base;
}

// ---------------------------------------------------------------------------
// Source context builder
// ---------------------------------------------------------------------------

function buildUserContext(req: ChiefResidentRequest): string {
  const { sourceText, bookTitle, mode, selectedText } = req;
  const bookNote = bookTitle ? `Book: "${bookTitle}"\n\n` : "";
  const modeLabel: Record<TeachingMode, string> = {
    "teach-page":        "Current page content to teach from:",
    "teach-note":        "Note to teach from:",
    "teach-study-sheet": "Study sheet to teach from:",
    "case-based":        "Source content for case-based teaching:",
    "rapid-fire":        "Content for rapid-fire questions:",
    "explain-mistake":   "Content context (the learner will describe their mistake next):",
    "explain-text":      "Full page context:",
    "explain-page":      "Current page content:",
  };
  if (mode === "explain-text" && selectedText) {
    return `${bookNote}HIGHLIGHTED PASSAGE:\n"""\n${selectedText.slice(0, 600)}\n"""\n\n${modeLabel[mode]}\n"""\n${sourceText.trim().slice(0, 2000)}\n"""\n\n---\n\nPlease explain the highlighted passage.`;
  }
  return `${bookNote}${modeLabel[mode]}\n\n${sourceText.trim()}\n\n---\n\nPlease begin the teaching session.`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "Chief Resident is temporarily unavailable. The teaching service has not been configured for this deployment." });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const body = req.body as ChiefResidentRequest;
  const { sourceText, mode, audience, messages = [] } = body;

  if (!sourceText || !mode) {
    return res.status(400).json({ error: "sourceText and mode are required" });
  }

  // Build message array for Claude
  const claudeMessages: TeachingMessage[] = messages.length === 0
    ? [{ role: "user", content: buildUserContext(body) }]
    : messages;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: getSystemPrompt(mode, audience),
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
