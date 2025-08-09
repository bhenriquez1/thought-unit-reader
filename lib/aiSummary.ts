// lib/aiSummary.ts
// Server-route–first summarizer with dev-only client fallback.
// Exports BOTH a named and default `summarizeText` to satisfy all imports.

import OpenAI from "openai";
import { getApiBase } from "./tts";

type Env = typeof process.env;

const ALLOW_CLIENT_OPENAI =
  typeof window !== "undefined" &&
  (process.env as Env).NEXT_PUBLIC_ALLOW_CLIENT_OPENAI === "true";

let openai: OpenAI | null = null;
if (ALLOW_CLIENT_OPENAI && (process.env as Env).OPENAI_API_KEY) {
  // ⚠️ Dev only. Do NOT enable in production.
  openai = new OpenAI({
    apiKey: (process.env as Env).OPENAI_API_KEY!,
    dangerouslyAllowBrowser: true,
  });
}

export interface SummarizeOpts {
  instructions?: string;
  sentences?: number;   // requested sentence count for server route
  model?: string;       // server route hint
  timeoutMs?: number;   // server route timeout
}

/**
 * summarizeText
 * 1) POSTs to /api/summarize (preferred; keeps keys server-side).
 * 2) If unavailable and dev fallback is enabled, uses client OpenAI.
 * 3) If neither is available, throws with a helpful message.
 */
export async function summarizeText(text: string, opts: SummarizeOpts = {}): Promise<string> {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("❌ Invalid input: text must be a non-empty string.");

  const {
    instructions,
    sentences = 4,
    model = "gpt-4o-mini",
    timeoutMs = 10000,
  } = opts;

  // --- Prefer server route ---
  const apiBase = getApiBase?.() ?? "";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${apiBase}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ text: trimmed, instructions, sentences, model }),
    });

    clearTimeout(t);

    if (res.ok) {
      const data = (await res.json()) as { summary?: string; error?: string };
      if (data.summary && data.summary.trim()) return data.summary.trim();
      if (data.error) throw new Error(data.error);
    }
    // fall through to fallback if non-OK
  } catch {
    clearTimeout(t);
    // swallow and try fallback
  }

  // --- Dev-only client fallback ---
  if (!openai) {
    throw new Error(
      "Summarization service unavailable. Add /api/summarize on the server OR enable dev fallback by setting NEXT_PUBLIC_ALLOW_CLIENT_OPENAI=true and OPENAI_API_KEY in .env.local."
    );
  }

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "You summarize content into short, clear, high-signal study notes. Avoid fluff. Keep it factual and concise.",
        },
        {
          role: "user",
          content:
            (instructions
              ? `Instructions: ${instructions}\n\n`
              : "") + `Summarize the following in ${sentences} sentences:\n\n${trimmed}`,
        },
      ],
    });

    const summary = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) throw new Error("Empty summary returned by OpenAI.");
    return summary;
  } catch (err: any) {
    console.error("AI summarization error:", err?.message || err);
    throw new Error("Failed to summarize text.");
  }
}

// Also provide default export so either import style works.
export default summarizeText;