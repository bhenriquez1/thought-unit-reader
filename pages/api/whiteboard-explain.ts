import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { concept, context = "General STEM explanation" } =
    (req.body ?? {}) as { concept?: string; context?: string };

  if (!concept || !concept.trim()) {
    return res.status(400).json({ error: "Missing 'concept'." });
  }

  try {
    const sys =
      "You are a precise teacher (Ninja Nerd vibe) who explains with a narrated whiteboard plan. Respond ONLY as strict JSON.";

    const user = `
Create a whiteboard teaching plan.
Constraints:
- Keep summary 1 short paragraph.
- Provide 3–6 concise drawing steps (each with title, description, and what to draw).
- Provide a single continuous narration script (plain text).
- Use simple, accurate language.

Return JSON in this exact shape:
{
  "summary": "string",
  "steps": [
    { "title": "string", "description": "string", "visualPrompt": "string" }
  ],
  "narrationScript": "string"
}

Concept: ${concept}
Context: ${context}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      // Let the model know this must be JSON; it's not a hard guarantee, so we still guard below
      response_format: { type: "json_object" } as any,
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    let data: any;

    // Try parsing JSON; if the model wrapped in a code block, strip it
    try {
      const cleaned = raw.trim().replace(/^```json/i, "```").replace(/^```/, "").replace(/```$/, "");
      data = JSON.parse(cleaned);
    } catch {
      // last resort: return as-is to help debugging
      console.error("Whiteboard JSON parse failed. Raw:", raw);
      return res.status(502).json({ error: "Bad AI response", raw });
    }

    // Basic validation
    if (
      !data ||
      typeof data.summary !== "string" ||
      !Array.isArray(data.steps) ||
      typeof data.narrationScript !== "string"
    ) {
      return res.status(502).json({ error: "Invalid AI payload", raw });
    }

    // Normalize steps
    const steps = data.steps
      .slice(0, 8)
      .map((s: any, i: number) => ({
        title: typeof s.title === "string" && s.title.trim() ? s.title : `Step ${i + 1}`,
        description: String(s.description ?? "").trim(),
        visualPrompt: String(s.visualPrompt ?? "").trim(),
      }));

    return res.status(200).json({
      summary: data.summary,
      steps,
      narrationScript: data.narrationScript,
    });
  } catch (err: any) {
    console.error("whiteboard-explain API error:", err?.message || err);
    return res.status(500).json({ error: "Failed to generate explanation" });
  }
}