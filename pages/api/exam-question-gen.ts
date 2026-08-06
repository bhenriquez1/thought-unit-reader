// pages/api/exam-question-gen.ts
// Universal Exam Engine — AI question generation, scoped to ONE concept
// (one UltraNote) at a time so a 30+ question exam build doesn't turn into
// a single giant eager call. Adapts the two-stage pattern from
// study-plan-diagnostic.ts:
//   Stage 1 (Claude, optional) — distills the concept's grounding text into
//     a short skill/misconception map, used to ground EngineQuestion's
//     skillTested/misconceptionTested fields.
//   Stage 2 (OpenAI, required) — writes the actual questions as strict JSON.
// Questions are always grounded in the caller-supplied concept text (the
// user's own notes) — never a static/copyrighted question bank.
// SECURITY: API keys are server-side only, never sent to the browser.

const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import type { DifficultyLevel, EngineQuestion, QuestionType } from "@/lib/examEngine/types";

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: "1mb" } },
};

type RequestBody = {
  examProfileId: string;
  bookId: string;
  bookTitle?: string;
  conceptId: string;     // UltraNote.id — the grounding source for this batch
  conceptText: string;   // aggregated note content (pageThesis/sections/concepts/etc.)
  topic?: string;
  section?: string;
  sourcePageNumber?: number;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  count?: number;        // default 5
};

type RawQuestion = {
  stem: string;
  choices: string[];
  correctIndex: number;
  whyCorrect: string;
  whyWrong: string[];
  trapType?: string;
  skillTested: string;
  misconceptionTested?: string;
  subject?: string;
  unit?: string;
  subtopic?: string;
  concept?: string;
};

const SKILL_MAP_SYSTEM_PROMPT = `You are an exam-content analyst. Read the provided study-note content for ONE concept and extract the testable skills and common misconceptions it supports.

Output plain text, one line per skill in this exact format:
SKILL: <short skill name> | MISCONCEPTION: <a common student misconception about this skill, or "none">

Output 2-6 lines. No markdown, no JSON, no commentary.`;

const QUESTION_SYSTEM_PROMPT = `You are an expert exam-item writer. Generate ORIGINAL exam questions grounded ONLY in the provided concept text — never reproduce or paraphrase questions from any commercial test-prep course or question bank.

For each question:
- "stem": a clear question testable from the concept text.
- "choices": exactly 4 answer options, only one correct.
- "correctIndex": index (0-3) of the correct choice.
- "whyCorrect": 1-2 sentences explaining why the correct choice is right.
- "whyWrong": an array of exactly 4 strings, one per choice, explaining why each WRONG choice is wrong (the entry at correctIndex can be an empty string).
- "trapType": if a choice exploits a known misconception or surface-level pattern match, name the trap (e.g. "confuses rate with equilibrium"); omit if none.
- "skillTested": the specific skill this question exercises.
- "misconceptionTested": the misconception a wrong answer reveals, if applicable.
- "subject", "unit", "subtopic", "concept": short labels categorizing this question, derived from the concept text and topic hint.

Match the requested question type:
- "recognition": identify which pattern/concept applies to a described scenario.
- "decision": apply the correct rule/decision given a scenario.
- "application": multi-step application of the concept to a new scenario.
- "trap_training": the question is built specifically to test whether the student falls for the concept's most common trap.
- "recall": direct factual recall of a definition, value, or rule.

Match the requested difficulty:
- "foundation": single-concept, straightforward, easy-to-medium.
- "simulation": real-exam pacing and mixed difficulty, medium.
- "mastery": harder than the real exam, multi-concept reasoning, trap-heavy.

OUTPUT FORMAT — return ONLY valid JSON matching this exact schema:
{
  "questions": [ { "stem": "string", "choices": ["string","string","string","string"], "correctIndex": 0, "whyCorrect": "string", "whyWrong": ["string","string","string","string"], "trapType": "string", "skillTested": "string", "misconceptionTested": "string", "subject": "string", "unit": "string", "subtopic": "string", "concept": "string" } ]
}
Return ONLY the JSON object — no markdown fences, no explanation outside the JSON.`;

/** Stage 1 — optional Claude pass distilling the concept into a skill map.
 *  Returns null if CLAUDE_API_KEY is unset or the call fails. */
async function buildSkillMap(conceptText: string, topic?: string): Promise<string | null> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: [{ type: "text", text: SKILL_MAP_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `TOPIC: ${topic || "Unknown"}\n\n${conceptText}`,
      }],
    } as Parameters<typeof client.messages.create>[0]) as Anthropic.Message;

    const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    return raw || null;
  } catch (e) {
    DEV && console.error("[EXAM_QUESTION_GEN_SKILLMAP_ERROR]", String(e));
    return null;
  }
}

function buildUserPrompt(
  conceptText: string,
  topic: string | undefined,
  section: string | undefined,
  questionType: QuestionType,
  difficulty: DifficultyLevel,
  count: number,
  skillMap: string | null,
): string {
  let prompt = `Generate exactly ${count} "${questionType}" questions at "${difficulty}" difficulty`;
  if (topic) prompt += ` for topic: ${topic}`;
  if (section) prompt += ` (exam section: ${section})`;
  prompt += ".\n\n";
  if (skillMap) {
    prompt += `=== SKILL MAP ===\n${skillMap}\n\n`;
  }
  prompt += "=== CONCEPT SOURCE TEXT (the only material to ground questions in) ===\n\n";
  prompt += conceptText;
  prompt += "\n\n=== INSTRUCTION ===\nReturn only the JSON object.";
  return prompt;
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeQuestions(
  raw: unknown,
  req: RequestBody,
  fallbackCount: number,
): EngineQuestion[] {
  const arr = Array.isArray((raw as any)?.questions) ? (raw as any).questions as RawQuestion[] : [];
  const out: EngineQuestion[] = [];
  for (const q of arr) {
    if (!q || typeof q.stem !== "string") continue;
    const choices = Array.isArray(q.choices) ? q.choices.filter((o): o is string => typeof o === "string") : [];
    if (choices.length !== 4) continue;
    const correctIndex = Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4 ? q.correctIndex : 0;
    const whyWrong = Array.isArray(q.whyWrong)
      ? [0, 1, 2, 3].map((i) => (typeof q.whyWrong[i] === "string" ? q.whyWrong[i] : ""))
      : ["", "", "", ""];

    out.push({
      id: genId("eq"),
      examProfileId: req.examProfileId,
      section: req.section || "general",
      subject: typeof q.subject === "string" && q.subject.trim() ? q.subject.trim() : (req.topic || "General"),
      unit: typeof q.unit === "string" && q.unit.trim() ? q.unit.trim() : (req.topic || "General"),
      topic: req.topic || "General",
      subtopic: typeof q.subtopic === "string" && q.subtopic.trim() ? q.subtopic.trim() : undefined,
      concept: typeof q.concept === "string" && q.concept.trim() ? q.concept.trim() : (req.topic || "General"),
      difficulty: req.difficulty,
      questionType: req.questionType,
      skillTested: typeof q.skillTested === "string" && q.skillTested.trim() ? q.skillTested.trim() : "General",
      misconceptionTested: typeof q.misconceptionTested === "string" && q.misconceptionTested.trim() ? q.misconceptionTested.trim() : undefined,
      sourceStudyModelId: req.conceptId,
      sourceBookId: req.bookId,
      sourcePageNumber: req.sourcePageNumber,
      stem: q.stem,
      choices,
      correctIndex,
      whyCorrect: typeof q.whyCorrect === "string" ? q.whyCorrect : "",
      whyWrong,
      trapType: typeof q.trapType === "string" && q.trapType.trim() ? q.trapType.trim() : undefined,
      createdAt: new Date().toISOString(),
    });
  }
  return out.slice(0, Math.max(fallbackCount, 1));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as RequestBody;
  const count = Math.min(Math.max(body.count ?? 5, 1), 15);

  if (!body.conceptText || !body.conceptText.trim()) {
    res.status(400).json({ error: "conceptText is required to generate grounded questions." });
    return;
  }
  if (!body.examProfileId || !body.bookId || !body.conceptId || !body.questionType || !body.difficulty) {
    res.status(400).json({ error: "examProfileId, bookId, conceptId, questionType, and difficulty are required." });
    return;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    DEV && console.error("[EXAM_QUESTION_GEN_API] OPENAI_API_KEY not set");
    res.status(200).json({ questions: [], provider: "fallback", error: "API key not configured" });
    return;
  }

  const skillMap = await buildSkillMap(body.conceptText.slice(0, 20_000), body.topic);

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 50_000);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      signal: ctrl.signal,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: QUESTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserPrompt(
              body.conceptText.slice(0, 20_000),
              body.topic,
              body.section,
              body.questionType,
              body.difficulty,
              count,
              skillMap,
            ),
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      DEV && console.error("[EXAM_QUESTION_GEN_API] OpenAI error:", resp.status, errText.slice(0, 200));
      res.status(200).json({ questions: [], provider: "fallback", error: `OpenAI ${resp.status}` });
      return;
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      DEV && console.error("[EXAM_QUESTION_GEN_API] JSON parse failed:", raw.slice(0, 200));
      res.status(200).json({ questions: [], provider: "fallback", error: "JSON parse failed" });
      return;
    }

    const questions = normalizeQuestions(parsed, body, count);
    if (questions.length === 0) {
      res.status(200).json({ questions: [], provider: "fallback", error: "No valid questions returned" });
      return;
    }

    const provider = skillMap ? "openai+claude" : "openai";
    DEV && console.log("[EXAM_QUESTION_GEN_SUCCESS]", { count: questions.length, bookId: body.bookId, conceptId: body.conceptId, provider });
    res.status(200).json({ questions, provider });
  } catch (err) {
    clearTimeout(timeout);
    const isAbort = (err as Error)?.name === "AbortError";
    DEV && console.error("[EXAM_QUESTION_GEN_API]", isAbort ? "timeout" : "error", String(err));
    res.status(200).json({
      questions: [],
      provider: "fallback",
      error: isAbort ? "Request timed out" : String(err),
    });
  }
}
