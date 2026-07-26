// pages/api/study-guide-generate.ts
// Study Guide Architect — builds a top-student notebook from multiple source documents.
// Thinks: "What would a 25 DAT student keep if they had 2 months before the exam?"
// SECURITY: OPENAI_API_KEY is server-side only, never sent to browser.

const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import type { StudyGuideMode, ExamGoal, PriorityLevel } from "@/lib/studyguide/types";
import { EXAM_GOAL_LABELS } from "@/lib/studyguide/types";

export const config = {
  maxDuration: 90,
  api: { bodyParser: { sizeLimit: "2mb" } },
};

type Source = { label: string; text: string };

type RequestBody = {
  sources: Source[];        // Textbook, blueprint, notes, etc.
  chapterTitle: string;
  topic: string;
  mode: StudyGuideMode;
  hasStudyModel?: boolean;  // true when RIGHT PANEL STUDY MODEL source is present
  examGoal?: ExamGoal;
  targetScore?: string;
};

type StudyGuideMechanism = { title: string; steps: string[] };

type StudyGuideOutputJSON = {
  chapterTitle: string;
  topic: string;
  priority: PriorityLevel;
  mustKnow: string[];
  datFacts: string[];
  mechanisms: StudyGuideMechanism[];
  traps: string[];
  recallQuestions: string[];
  memoryHooks: string[];
  dailyTasks: string[];
};

const MODE_PERSONA: Record<StudyGuideMode, string> = {
  dat:        "You are a DAT tutor with a 25+ score. Build notes for a student 2 months from the DAT. Be ruthlessly selective — only high-yield facts, mechanisms, and traps.",
  dental:     "You are a dental school professor. Build board-level notes. Clinical relevance first. Every mechanism must be board-tested.",
  topstudent: "You are the top student in a pre-med class. Build the notebook you would actually use — not a summary, but the distilled essence a serious student keeps.",
  examcram:   "You are a last-minute tutor. 48 hours before the exam. Only what cannot be missed. No fluff, no explanations beyond what's needed to answer a question.",
  visual:     "You are a visual learner's tutor. Build mechanism maps, flowcharts, and memory hooks. Every concept needs a visual structure.",
  highyield:  "You are a board exam coach. Every sentence chosen because it appears on standardized exams. Nothing decorative. Every fact must be testable.",
};

function buildSystemPrompt(mode: StudyGuideMode, hasStudyModel?: boolean, examGoal?: ExamGoal, targetScore?: string): string {
  const groundingNote = hasStudyModel
    ? `\nIMPORTANT: The source labeled "RIGHT PANEL STUDY MODEL" is the authoritative grounding document. It contains the page thesis, concept blocks, mechanisms, and high-yield anchors already extracted from the book. Your output MUST be grounded in those specific concepts — not generic biology. Every fact, mechanism, and trap you write must be traceable to that source material.\n`
    : "";

  const goalLabel = examGoal ? EXAM_GOAL_LABELS[examGoal] : null;
  const examGoalNote = goalLabel
    ? `\nSTUDY GOAL: The student is preparing for the ${goalLabel}${targetScore ? ` (target score: ${targetScore})` : ""}. Frame "priority", "datFacts", "traps", and "dailyTasks" specifically around what is tested on the ${goalLabel} — not generic textbook coverage. The goal is not to summarize the book; it is to tell the student what to study, what to skip, and how to remember it for the ${goalLabel}.\n`
    : "";

  return `${MODE_PERSONA[mode]}
${groundingNote}${examGoalNote}
YOUR CORE PHILOSOPHY:
Do NOT summarize everything. Ask yourself:
"If this student had only 2 months before the exam and a limited study window per day, what information is actually worth their time?"

Filter ruthlessly. Keep only:
- High-yield concepts that appear on exams
- Core mechanisms (cause → effect chains)
- High-yield testable facts (numbers, ratios, named syndromes, clinical facts)
- Common traps (what students confuse on exam day)
- Recall questions that test understanding, not memorization
- Memory hooks (mnemonics, patterns, star-worthy connections)
- A daily study task list (what to read, how many practice questions to do)

OUTPUT FORMAT — return ONLY valid JSON matching this exact schema:
{
  "chapterTitle": "string — e.g. Chapter 2: The Chemical Context of Life",
  "topic": "string — e.g. Matter, Elements, and Compounds",
  "priority": "High" | "Medium" | "Low",  // how important this topic is for the stated exam goal
  "mustKnow": ["string", ...],           // 3–6 core facts every student must know, full sentences
  "datFacts": ["string", ...],           // 3–8 high-yield testable facts: stats, X→Y, named syndromes
  "mechanisms": [                         // 1–4 mechanism flowcharts
    { "title": "string", "steps": ["string", "string", ...] }  // 3–6 steps each
  ],
  "traps": ["string", ...],              // 2–5 common exam mistakes or contrast pairs
  "recallQuestions": ["string", ...],    // 4–8 active recall questions (answerable from content)
  "memoryHooks": ["string", ...],        // 1–4 mnemonics, acronyms, or memorable patterns
  "dailyTasks": ["string", ...]          // 2–4 concrete daily study tasks, e.g. "Read pages 1-20", "Complete 20 practice questions on enzyme kinetics"
}

RULES:
- priority: "High" if this topic is heavily tested on the stated exam, "Medium" if occasionally tested, "Low" if rarely tested or background-only
- mustKnow: complete sentences, exam-level precision
- datFacts: short, punchy, star-worthy — "X → Y", percentages, names
- mechanisms: clear step-by-step chains, not definitions
- traps: contrast pairs like "X ≠ Y" or "students confuse A with B"
- recallQuestions: start with What/Why/How/Where — not yes/no
- memoryHooks: must actually help remember the fact, not just repeat it
- dailyTasks: concrete and actionable, tied to the source material and exam goal
- Return ONLY the JSON object — no markdown fences, no explanation`;
}

function buildUserPrompt(sources: Source[], chapterTitle: string, topic: string, mode: StudyGuideMode, examGoal?: ExamGoal, targetScore?: string): string {
  const modeLabel: Record<StudyGuideMode, string> = {
    dat: "Study Sheet", dental: "Dental School Notes",
    topstudent: "Top Student Notes", examcram: "Exam Cram Notes",
    visual: "Visual Learner Notes", highyield: "High-Yield Notes",
  };

  let prompt = `Build ${modeLabel[mode]} for:\nChapter: ${chapterTitle || "Unknown"}\nTopic: ${topic || "Unknown"}\n`;
  if (examGoal) {
    prompt += `Exam Goal: ${EXAM_GOAL_LABELS[examGoal]}${targetScore ? ` (target score: ${targetScore})` : ""}\n`;
  }
  prompt += "\n=== SOURCE DOCUMENTS ===\n\n";

  for (const src of sources) {
    if (!src.text?.trim()) continue;
    prompt += `--- ${src.label.toUpperCase()} ---\n`;
    prompt += src.text.slice(0, 3000).trim();
    prompt += "\n\n";
  }

  prompt += "=== INSTRUCTION ===\n";
  prompt += `Now think: what would a top student keep from these sources for ${modeLabel[mode]}?\n`;
  prompt += "Return only the JSON object.";
  return prompt;
}

function buildFallback(chapterTitle: string, topic: string): StudyGuideOutputJSON {
  return {
    chapterTitle: chapterTitle || "Chapter",
    topic: topic || "Topic",
    priority: "Medium",
    mustKnow: ["Study guide generation failed — check your API key or try again."],
    datFacts: [],
    mechanisms: [],
    traps: [],
    recallQuestions: [],
    memoryHooks: [],
    dailyTasks: [],
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { sources, chapterTitle, topic, mode, hasStudyModel, examGoal, targetScore } = req.body as RequestBody;

  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    res.status(400).json({ error: "At least one source document is required." });
    return;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    DEV && console.error("[STUDYGUIDE_API] OPENAI_API_KEY not set");
    res.status(200).json({ guide: buildFallback(chapterTitle, topic), provider: "fallback", error: "API key not configured" });
    return;
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 75_000);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      signal: ctrl.signal,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(mode ?? "dat", hasStudyModel, examGoal, targetScore) },
          { role: "user",   content: buildUserPrompt(sources, chapterTitle, topic, mode ?? "dat", examGoal, targetScore) },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      DEV && console.error("[STUDYGUIDE_API] OpenAI error:", resp.status, errText.slice(0, 200));
      res.status(200).json({ guide: buildFallback(chapterTitle, topic), provider: "fallback", error: `OpenAI ${resp.status}` });
      return;
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";

    let parsed: StudyGuideOutputJSON;
    try {
      parsed = JSON.parse(raw) as StudyGuideOutputJSON;
    } catch {
      DEV && console.error("[STUDYGUIDE_API] JSON parse failed:", raw.slice(0, 200));
      res.status(200).json({ guide: buildFallback(chapterTitle, topic), provider: "fallback", error: "JSON parse failed" });
      return;
    }

    // Normalize — ensure all arrays exist
    const guide: StudyGuideOutputJSON = {
      chapterTitle: parsed.chapterTitle || chapterTitle,
      topic:        parsed.topic        || topic,
      priority:     (["High", "Medium", "Low"] as const).includes(parsed.priority) ? parsed.priority : "Medium",
      mustKnow:         Array.isArray(parsed.mustKnow)         ? parsed.mustKnow         : [],
      datFacts:         Array.isArray(parsed.datFacts)         ? parsed.datFacts         : [],
      mechanisms:       Array.isArray(parsed.mechanisms)       ? parsed.mechanisms       : [],
      traps:            Array.isArray(parsed.traps)            ? parsed.traps            : [],
      recallQuestions:  Array.isArray(parsed.recallQuestions)  ? parsed.recallQuestions  : [],
      memoryHooks:      Array.isArray(parsed.memoryHooks)      ? parsed.memoryHooks      : [],
      dailyTasks:       Array.isArray(parsed.dailyTasks)       ? parsed.dailyTasks       : [],
    };

    DEV && console.log("[STUDYGUIDE_API_SUCCESS]", {
      mode, chapterTitle, topic, examGoal: examGoal ?? "(none)",
      priority: guide.priority,
      mustKnow: guide.mustKnow.length,
      datFacts: guide.datFacts.length,
      mechanisms: guide.mechanisms.length,
      traps: guide.traps.length,
      dailyTasks: guide.dailyTasks.length,
    });

    res.status(200).json({ guide, provider: "openai" });
  } catch (err) {
    clearTimeout(timeout);
    const isAbort = (err as Error)?.name === "AbortError";
    DEV && console.error("[STUDYGUIDE_API]", isAbort ? "timeout" : "error", String(err));
    res.status(200).json({
      guide: buildFallback(chapterTitle, topic),
      provider: "fallback",
      error: isAbort ? "Request timed out — try with shorter text" : String(err),
    });
  }
}
