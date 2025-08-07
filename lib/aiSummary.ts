// lib/aiSummary.ts
import OpenAI from "openai";

// 🔹 Initialize OpenAI with API key from environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Loaded from .env.local
});

/**
 * Summarizes a given input text into short study notes.
 * @param text - The raw input text to summarize
 * @returns A short summary string
 */
export async function summarizeText(text: string): Promise<string> {
  if (!text || typeof text !== "string") {
    throw new Error("❌ Invalid input: text must be a non-empty string.");
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use the lightweight model for speed
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that summarizes content into short, clear, and focused study notes."
        },
        {
          role: "user",
          content: `Summarize the following text in 3–4 sentences:\n\n${text}`
        }
      ],
      temperature: 0.5,
      max_tokens: 200,
    });

    const summary = completion.choices?.[0]?.message?.content?.trim() || "";

    if (!summary) {
      throw new Error("❌ Empty summary returned by OpenAI.");
    }

    return summary;
  } catch (error: any) {
    console.error("❌ AI summarization error:", error.message || error);
    throw new Error("Failed to summarize text.");
  }
}