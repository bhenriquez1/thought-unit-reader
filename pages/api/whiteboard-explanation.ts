import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "HEAD") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  try {
    const { concept, context = "General STEM explanation" } = req.body || {};
    if (!concept || typeof concept !== "string") {
      return res.status(400).json({ error: "Bad request: 'concept' must be a non-empty string." });
    }

    const prompt = `You are Ninja Nerd giving a whiteboard explanation.

Concept: ${concept}
Context: ${context}

1. Provide a 1-paragraph summary of the concept.
2. Break it down in a clear voice script for explaining aloud to students.
3. Then give 3–6 concise whiteboard animation steps that a teacher would draw while speaking.

Return format:
Summary:
"Short summary here..."

VoiceScript:
"Your spoken explanation here..."

WhiteboardSteps:
- Step 1 drawing instructions...
- Step 2 drawing instructions...
...`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.5,
      messages: [{ role: "user", content: prompt }],
    });

    const content = completion.choices[0]?.message?.content || "";

    const summaryMatch = content.match(/Summary:\s*"([\s\S]*?)"\s*VoiceScript:/);
    const voiceScriptMatch = content.match(/VoiceScript:\s*"([\s\S]*?)"\s*WhiteboardSteps:/);
    const stepsBlock = content.match(/WhiteboardSteps:\s*([\s\S]*)/);

    const summary = summaryMatch?.[1]?.trim() || "";
    const narrationScript = voiceScriptMatch?.[1]?.trim() || "";
    const rawLines = stepsBlock?.[1]?.trim().split(/\n+/).filter(Boolean) || [];

    const steps = rawLines.map((line: string, index: number) => {
      const cleaned = line.replace(/^[-*]\s*/, "").trim();
      return {
        title: `Step ${index + 1}`,
        description: cleaned,
        visualPrompt: `Illustrate: ${cleaned}`,
      };
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ summary, steps, narrationScript });
  } catch (err: any) {
    console.error("Whiteboard explanation API error:", err?.message || err);
    return res.status(500).json({ error: "Failed to generate whiteboard explanation." });
  }
}