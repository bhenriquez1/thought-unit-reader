import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Make sure to set in .env.local
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Invalid text input" });
    }

    // Call OpenAI GPT‑4o‑mini for intelligent summarization
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that summarizes text for study notes. " +
            "Keep summaries short, clear, and focused on key ideas."
        },
        {
          role: "user",
          content: `Summarize the following text in 3–4 sentences:\n\n${text}`
        }
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const summary = completion.choices[0]?.message?.content?.trim() || "";

    return res.status(200).json({ summary });
  } catch (err) {
    console.error("❌ AI Summary API error:", err);
    return res.status(500).json({ error: "Failed to summarize text" });
  }
}