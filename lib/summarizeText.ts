// lib/summarizeText.ts
import { OpenAIStream, StreamingTextResponse } from "ai";
import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Summarizes a long text input into a short explanation.
 * Optionally include the reading level or child age for Elena Mode.
 */
export async function summarizeText(input: string, readingLevel?: string) {
  if (!input || input.trim() === "") throw new Error("Text is empty");

  const prompt = `Summarize the following content in a short and clear way that preserves all essential ideas. 
  ${readingLevel ? `Use a style appropriate for a child aged ${readingLevel}.` : ""}

  Content:
  ${input.trim()}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a teacher AI that simplifies dense topics without losing meaning."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.6
  });

  return response.choices[0]?.message.content || "Summary not available.";
}