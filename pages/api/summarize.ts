// pages/api/summarize.ts
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

type Mode = "plain" | "sketch" | "highYield";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "HEAD") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!apiKey) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  // Accept BOTH the new body ({ text, instructions, sentences, model })
  // and the old body ({ text, mode }).
  const {
    text,
    instructions,
    sentences = 4,
    model = "gpt-4o-mini",
    mode, // optional legacy
  } = (req.body ?? {}) as {
    text?: string;
    instructions?: string;
    sentences?: number;
    model?: string;
    mode?: Mode;
  };

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Missing or invalid 'text'." });
  }

  // Build style from either explicit 'mode' (legacy) or instructions/sentences (new)
  const sysBase =
    "You summarize content into short, clear, high-signal study notes. Avoid fluff. Be correct and concise.";

  // Legacy styles if mode is provided
  const legacyStyle =
    mode === "sketch"
      ? "Return short, handwritten-style phrases (no full sentences), separated by line breaks. Keep it casual, like quick sticky notes."
      : mode === "highYield"
      ? "Return an organized, high-yield study sheet: 3–5 bullet points of key facts, 1–2 must-know formulas (if relevant), and 1 quick pitfall to avoid."
      : `Return a clear ${Math.max(1, Number(sentences) || 4)}-sentence summary.`;

  const finalInstructions =
    instructions?.trim()
      ? `Instructions: ${instructions.trim()}`
      : legacyStyle;

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: 220,
      messages: [
        { role: "system", content: sysBase },
        {
          role: "user",
          content:
            `${finalInstructions}\n\n` +
            `--- TEXT START ---\n${text}\n--- TEXT END ---`,
        },
      ],
    });

    const summary = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) {
      return res.status(500).json({ error: "Empty response from model." });
    }

    return res.status(200).json({ summary });
  } catch (err: any) {
    console.error("Summarize API error:", err?.message || err);
    return res.status(500).json({ error: "Failed to summarize." });
  }
}