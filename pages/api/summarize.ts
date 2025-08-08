import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // <-- server-side only
});

type Mode = "plain" | "sketch" | "highYield";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { text, mode = "plain" } = req.body as { text?: string; mode?: Mode };

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Missing or invalid 'text'." });
  }

  try {
    const systemBase =
      "You are an assistant that summarizes text for study. Be correct and concise.";

    const styleHint =
      mode === "sketch"
        ? "Return short, handwritten-style phrases (no full sentences), separated by line breaks. Keep it casual, like quick sticky notes."
        : mode === "highYield"
        ? "Return an organized, high-yield study sheet: 3-5 bullet points of key facts, 1-2 must-know formulas (if relevant), and 1 quick pitfall to avoid."
        : "Return a clear 3–4 sentence summary.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 220,
      messages: [
        { role: "system", content: systemBase },
        {
          role: "user",
          content: `Summarize the following. Style: ${mode}.
Guidelines: ${styleHint}

--- TEXT START ---
${text}
--- TEXT END ---`,
        },
      ],
    });

    const summary = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) {
      return res.status(500).json({ error: "Empty response from model." });
    }

    return res.status(200).json({ summary, mode });
  } catch (err: any) {
    console.error("Summarize API error:", err?.message || err);
    return res.status(500).json({ error: "Failed to summarize." });
  }
}