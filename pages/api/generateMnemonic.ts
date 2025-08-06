// pages/api/generateMnemonic.ts
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * API endpoint to call OpenAI and return a mnemonic for selected text.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    // ✅ Replace with your real OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenAI API key not set" });
    }

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a mnemonic generator." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 60
      })
    });

    if (!aiResponse.ok) {
      throw new Error(`OpenAI API error: ${aiResponse.status}`);
    }

    const data = await aiResponse.json();

    const mnemonic =
      data?.choices?.[0]?.message?.content?.trim() || "Unable to generate mnemonic.";

    res.status(200).json({ mnemonic });
  } catch (err) {
    console.error("❌ Mnemonic API error:", err);
    res.status(500).json({ error: "Failed to generate mnemonic" });
  }
}