// lib/aiSummary.ts
// Safer client API that prefers a server route. Falls back to client OpenAI only if explicitly allowed.

import OpenAI from "openai";

/** Optional local-dev fallback (set in .env.local)
 *  NEXT_PUBLIC_ALLOW_CLIENT_OPENAI=true
 *  OPENAI_API_KEY=sk-...
 */
const ALLOW_CLIENT_OPENAI =
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_ALLOW_CLIENT_OPENAI === "true";

let openai: OpenAI | null = null;
if (ALLOW_CLIENT_OPENAI && process.env.OPENAI_API_KEY) {
  // ⚠️ Only for local dev. Do NOT enable in production.
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Summarizes a given input text into short study notes (3–4 sentences).
 * Tries /api/summarize first. If unavailable (e.g., local dev), falls back to client OpenAI
 * when NEXT_PUBLIC_ALLOW_CLIENT_OPENAI=true and OPENAI_API_KEY is present.
 */
export async function summarizeText(text: string): Promise<string> {
  if (!text || typeof text !== "string") {
    throw new Error("❌ Invalid input: text must be a non-empty string.");
  }

  // 1) Prefer calling your server/edge function
  try {
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        // You can tweak these on the server as needed
        model: "gpt-4o-mini",
        sentences: 4,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { summary?: string; error?: string };
      if (data.summary && data.summary.trim()) {
        return data.summary.trim();
      }
      if (data.error) {
        throw new Error(data.error);
      }
    }
    // If the route exists but returned a non-OK status, fall through to the fallback
  } catch (_) {
    // Network or route not found — try fallback if allowed
  }

  // 2) Fallback: direct client OpenAI (dev only)
  if (!openai) {
    throw new Error(
      "Summarization service unavailable. Add an /api/summarize route OR enable local fallback by setting NEXT_PUBLIC_ALLOW_CLIENT_OPENAI=true and OPENAI_API_KEY in .env.local."
    );
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You summarize content into short, clear, high-signal study notes. Avoid fluff. Keep it factual and concise.",
        },
        {
          role: "user",
          content: `Summarize the following in 3–4 sentences:\n\n${text}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 220,
    });

    const summary = completion.choices?.[0]?.message?.content?.trim() || "";
    if (!summary) throw new Error("❌ Empty summary returned by OpenAI.");
    return summary;
  } catch (error: any) {
    console.error("❌ AI summarization error:", error?.message || error);
    throw new Error("Failed to summarize text.");
  }
}