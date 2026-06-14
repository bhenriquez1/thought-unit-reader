// lib/explainStep/parseAnswer.ts
// Aggregates the AI Tutor's structured reply sections (📌 Direct Answer,
// 🔍 Why?, 💡 Example, ⚠️ Common Mistake) across an entire Explain This Step
// conversation, so the result can be saved to NoteLab / RecallLab in their
// normal formats instead of as a raw chat transcript.

import type { ExplainStepMessage } from "./types";

export interface ParsedExplainStepAnswer {
  directAnswer: string;
  why: string;
  example: string;
  commonMistake: string;
}

const MARKER_FIELD: { marker: string; field: keyof ParsedExplainStepAnswer; labelStrip: RegExp }[] = [
  { marker: "📌", field: "directAnswer", labelStrip: /^📌\s*Direct Answer\s*[—:-]*\s*/i },
  { marker: "🔍", field: "why", labelStrip: /^🔍\s*Why\??\s*[—:-]*\s*/i },
  { marker: "💡", field: "example", labelStrip: /^💡\s*Example\s*[—:-]*\s*/i },
  { marker: "⚠️", field: "commonMistake", labelStrip: /^⚠️\s*Common Mistake\s*[—:-]*\s*/i },
];

// All section markers the AI Tutor prompt uses, including the untracked ones
// (🧠 Try It Yourself, ❓ follow-up) which mark the end of a tracked section.
const ALL_MARKERS = ["📌", "🔍", "💡", "⚠️", "🧠", "❓"];

/**
 * Walks every assistant turn and pulls out the latest content for each
 * tracked section. Later turns override earlier ones for the same section,
 * since follow-up answers (e.g. "Why?") refine/replace the original.
 */
export function parseExplainStepConversation(turns: ExplainStepMessage[]): ParsedExplainStepAnswer {
  const result: ParsedExplainStepAnswer = { directAnswer: "", why: "", example: "", commonMistake: "" };

  for (const turn of turns) {
    if (turn.role !== "assistant") continue;
    const lines = turn.content.split("\n");
    let active: (typeof MARKER_FIELD)[number] | null = null;
    let buffer: string[] = [];

    const flush = () => {
      if (active && buffer.length) {
        const text = buffer.join("\n").trim();
        if (text) result[active.field] = text;
      }
      buffer = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const tracked = MARKER_FIELD.find((m) => trimmed.startsWith(m.marker));
      if (tracked) {
        flush();
        active = tracked;
        const rest = trimmed.replace(tracked.labelStrip, "").trim();
        if (rest) buffer.push(rest);
        continue;
      }
      if (ALL_MARKERS.some((m) => trimmed.startsWith(m))) {
        // 🧠 Try It Yourself / ❓ follow-up — not tracked, end the current section.
        flush();
        active = null;
        continue;
      }
      if (active) buffer.push(line);
    }
    flush();
  }

  // Fallback: if the tutor never produced a 📌 section (shouldn't normally
  // happen), use the first assistant message with markers stripped.
  if (!result.directAnswer) {
    const firstAssistant = turns.find((t) => t.role === "assistant");
    if (firstAssistant) {
      result.directAnswer = firstAssistant.content
        .replace(new RegExp(`[${ALL_MARKERS.join("")}]`, "g"), "")
        .trim()
        .slice(0, 600);
    }
  }

  return result;
}
