// lib/aiSummary.ts
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Reads from .env.local
});

/**
 * Summarizes a given text into short study notes.
 * @param text - The text to summarize
 * @returns Summary string
 */
export async function summarizeText(text: string): Promise<string> {
  if (!text || typeof text !== "string") {
    throw new Error("Invalid text input for summarization.");
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that summarizes text for study notes. Keep summaries short, clear, and focused on key ideas."
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
    return summary;
  } catch (err) {
    console.error("❌ Error during AI summarization:", err);
    throw new Error("Failed to summarize text");
  }
}