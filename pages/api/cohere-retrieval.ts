// pages/api/cohere-retrieval.ts
// Cohere API — related reading retrieval/ranking, related video ranking, semantic search.
// Key read from server env only — never exposed to browser.
import type { NextApiRequest, NextApiResponse } from "next";

export interface CohereRetrievalInput {
  topic: string;           // page thesis or coreIdea
  domain?: string;         // math, science, clinical, general
  mode: "readings" | "videos" | "both";
  pageText?: string;       // optional extra context (first 400 chars)
}

export interface CohereRetrievalOutput {
  relatedReadings: string[];   // 3–5 search queries for textbook/article readings
  relatedVideos:   string[];   // 3–5 YouTube/educational video search queries
  provider: "cohere" | "fallback";
}

function buildFallback(topic: string): CohereRetrievalOutput {
  const base = topic.slice(0, 60);
  return {
    relatedReadings: [
      `${base} explained`,
      `${base} textbook chapter`,
      `${base} study notes`,
    ],
    relatedVideos: [
      `${base} lecture`,
      `${base} tutorial`,
      `${base} explained simply`,
    ],
    provider: "fallback",
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.COHERE_API_KEY?.trim();
  if (!apiKey) {
    console.error("[COHERE_API_KEY_MISSING] Set COHERE_API_KEY in .env.local");
    return res.status(503).json({ error: "Cohere not configured" });
  }

  const body    = req.body as CohereRetrievalInput;
  const topic   = String(body?.topic  ?? "").trim().slice(0, 300);
  const domain  = String(body?.domain ?? "general").trim();
  const mode    = body?.mode ?? "both";
  const pageCtx = String(body?.pageText ?? "").slice(0, 400);

  if (!topic) return res.status(400).json({ error: "topic required" });

  const domainHint: Record<string, string> = {
    math:     "mathematics, calculus, algebra, statistics textbooks and lectures",
    science:  "biology, chemistry, physics, genetics, physiology textbooks and lectures",
    clinical: "medical, dental, nursing, pharmacology, pathology board review resources",
    general:  "educational textbooks, academic articles, and lecture videos",
  };
  const hint = domainHint[domain] ?? domainHint.general;

  const prompt = `You are an academic resource curator. Given a study topic, generate exactly:
- 4 specific search queries a student would use to find related READINGS (textbook chapters, articles, review papers)
- 4 specific search queries a student would use to find educational VIDEOS (YouTube lectures, Khan Academy, etc.)

Topic: "${topic}"
Domain: ${hint}
${pageCtx ? `Additional context: ${pageCtx}` : ""}

Respond with ONLY valid JSON in this exact format:
{
  "relatedReadings": ["query1", "query2", "query3", "query4"],
  "relatedVideos":   ["query1", "query2", "query3", "query4"]
}

Rules:
- Each query must be 3–8 words, specific to the topic
- Readings: include subject-specific terms, "textbook", "review", or "mechanism" where appropriate
- Videos: include "lecture", "explained", "tutorial", or "animation" where appropriate
- Do NOT repeat the same query in both lists
- Output JSON only, no other text`;

  try {
    const ctrl = new AbortController();
    const to   = setTimeout(() => ctrl.abort(), 15_000);

    const resp = await fetch("https://api.cohere.ai/v2/chat", {
      signal: ctrl.signal,
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${apiKey}`,
        "X-Client-Name": "avrrio-reader",
      },
      body: JSON.stringify({
        model:       "command-r-plus",
        messages:    [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens:  400,
      }),
    }).finally(() => clearTimeout(to));

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("[COHERE_API_ERROR]", { status: resp.status, body: errText.slice(0, 200) });
      return res.status(200).json(buildFallback(topic));
    }

    const data = await resp.json();
    // v2 chat response shape: message.content[0].text
    const raw  = (data?.message?.content?.[0]?.text ?? data?.text ?? "").trim();

    let parsed: { relatedReadings?: string[]; relatedVideos?: string[] } = {};
    try {
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.warn("[COHERE_PARSE_FAIL]", { raw: raw.slice(0, 200) });
      return res.status(200).json(buildFallback(topic));
    }

    const readings = Array.isArray(parsed.relatedReadings)
      ? parsed.relatedReadings.filter(Boolean).slice(0, 5).map(String)
      : buildFallback(topic).relatedReadings;
    const videos = Array.isArray(parsed.relatedVideos)
      ? parsed.relatedVideos.filter(Boolean).slice(0, 5).map(String)
      : buildFallback(topic).relatedVideos;

    const result: CohereRetrievalOutput = {
      relatedReadings: mode === "videos"   ? [] : readings,
      relatedVideos:   mode === "readings" ? [] : videos,
      provider: "cohere",
    };

    console.log("[COHERE_RETRIEVAL_OK]", {
      topic: topic.slice(0, 80),
      readingCount: result.relatedReadings.length,
      videoCount:   result.relatedVideos.length,
    });

    return res.status(200).json(result);

  } catch (err) {
    console.error("[COHERE_RETRIEVAL_FAIL]", String(err));
    return res.status(200).json(buildFallback(topic));
  }
}
