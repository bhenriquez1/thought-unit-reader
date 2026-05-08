// pages/api/intelligenceSynthesis.ts
// Educational interpretation endpoint.
// Accepts extracted page content, returns an LLM-synthesized TeachingSynthesis.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/insights/synthesizeTeachingOutput";
import type { TeachingSynthesis } from "@/lib/insights/synthesizeTeachingOutput";
import type { PageDomain } from "@/lib/insights/detectPageDomain";
import type { UltraConceptBlock } from "@/lib/insights/buildUltraPageView";

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

const VALID_DOMAINS: PageDomain[] = ["math", "science", "clinical", "fiction", "general"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "HEAD") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!apiKey) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  const { pageText, domain, extractedConcepts } = (req.body ?? {}) as {
    pageText?: string;
    domain?: PageDomain;
    extractedConcepts?: UltraConceptBlock[];
  };

  if (!pageText || typeof pageText !== "string" || pageText.trim().length < 30) {
    return res.status(400).json({ error: "Missing or too-short 'pageText'." });
  }

  const safeDomain: PageDomain = VALID_DOMAINS.includes(domain as PageDomain)
    ? (domain as PageDomain)
    : "general";

  const safeConcepts: UltraConceptBlock[] = Array.isArray(extractedConcepts)
    ? extractedConcepts.slice(0, 6)
    : [];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(safeDomain) },
        { role: "user", content: buildUserPrompt(pageText, safeDomain, safeConcepts) },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      return res.status(500).json({ error: "Empty response from model." });
    }

    let synthesis: TeachingSynthesis;
    try {
      synthesis = JSON.parse(raw) as TeachingSynthesis;
    } catch {
      return res.status(500).json({ error: "Model returned invalid JSON." });
    }

    // Validate required fields
    if (!synthesis.coreIdea || !Array.isArray(synthesis.concepts)) {
      return res.status(500).json({ error: "Incomplete synthesis response." });
    }

    return res.status(200).json(synthesis);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("intelligenceSynthesis API error:", msg);
    return res.status(500).json({ error: "Failed to synthesize teaching output." });
  }
}
