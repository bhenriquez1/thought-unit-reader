// pages/api/speech-preprocess.ts
// Server-side OCR repair for speech text. Keeps API key server-side only.

import type { NextApiRequest, NextApiResponse } from "next";

interface RequestBody {
  text: string;
}

interface ResponseBody {
  cleaned: string;
  wasRepaired: boolean;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseBody>) {
  if (req.method !== "POST") {
    return res.status(405).json({ cleaned: "", wasRepaired: false, error: "Method not allowed" });
  }

  const body = req.body as RequestBody;
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text || text.length < 20) {
    return res.status(400).json({ cleaned: "", wasRepaired: false, error: "Text too short" });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return res.status(200).json({ cleaned: text, wasRepaired: false, error: "No API key" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1000,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are an OCR repair tool. The input is text extracted from a PDF that may contain OCR artifacts: fragmented words (\"LI m IT\"), drop-cap splits (\"T he\" → \"The\"), pipe separators, page numbers embedded in sentences, and corrupted capitalization. Fix ONLY the OCR corruption. Do NOT summarize, paraphrase, add explanations, or change content. Do NOT remove sentences. Return only the corrected text, nothing else.",
          },
          {
            role: "user",
            content: text.slice(0, 3000),
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      console.error("[SPEECH_PREPROCESS_API_ERROR]", { status: resp.status, errText: errText.slice(0, 200) });
      return res.status(200).json({ cleaned: text, wasRepaired: false, error: `OpenAI ${resp.status}` });
    }

    const data = await resp.json();
    const cleaned = (data?.choices?.[0]?.message?.content ?? "").trim();

    if (!cleaned || cleaned.length < 10) {
      return res.status(200).json({ cleaned: text, wasRepaired: false });
    }

    return res.status(200).json({ cleaned, wasRepaired: true });
  } catch (err: unknown) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[SPEECH_PREPROCESS_ERROR]", { message });
    return res.status(200).json({ cleaned: text, wasRepaired: false, error: message });
  }
}
