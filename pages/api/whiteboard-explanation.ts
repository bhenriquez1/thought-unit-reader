// pages/api/whiteboard-explanation.ts
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { concept, context = "General STEM explanation" } = req.body || {};
  if (!concept?.trim()) {
    return res.status(400).json({ error: "Missing concept" });
  }

  const system = `
You are Ninja Nerd giving a concise whiteboard explanation.
Return strict JSON:
{
  "summary": string,
  "narrationScript": string,
  "steps": [{ "title": string, "description": string, "visualPrompt": string }]
}
`;

  const user = `Concept: ${concept}\nContext: ${context}`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.5,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const content = resp.choices[0]?.message?.content ?? "{}";
    const data = JSON.parse(content);
    // very light sanity check
    data.steps ??= [];
    return res.status(200).json(data);
  } catch (e: any) {
    console.error("OpenAI error:", e);
    return res.status(500).json({ error: "LLM generation failed" });
  }
}