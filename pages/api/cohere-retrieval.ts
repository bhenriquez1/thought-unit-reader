// pages/api/cohere-retrieval.ts
// Cohere API — related reading retrieval/ranking, related video ranking, semantic search.
// Key read from server env only — never exposed to browser.
const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";

export interface CohereRetrievalInput {
  topic: string;           // page thesis or coreIdea
  domain?: string;         // math, science, clinical, general
  mode: "readings" | "videos" | "both";
  pageText?: string;       // optional extra context (first 400 chars)
  /** Diagnostic identifiers only — never used in prompting, logged on failure for observability. */
  pageTruthKey?: string;
  canonicalUnitId?: string;
}

export interface CohereRetrievalOutput {
  relatedReadings: string[];   // 3–5 search queries for textbook/article readings
  relatedVideos:   string[];   // 3–5 YouTube/educational video search queries
  provider: "cohere" | "fallback";
  /** Degraded-mode envelope — present only when Cohere could not run (missing config
   *  or upstream failure after retries). relatedReadings/relatedVideos are still filled
   *  with the deterministic local fallback so the caller never renders an empty section. */
  ok?:              boolean;
  code?:            "UPSTREAM_UNAVAILABLE";
  message?:         string;
  fallbackAllowed?: boolean;
}

const RETRIEVAL_TIMEOUT_MS = 15_000;
const RETRY_BACKOFF_MS     = 500;

function buildFallback(topic: string, degraded?: { message: string }): CohereRetrievalOutput {
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
    ...(degraded ? { ok: false, code: "UPSTREAM_UNAVAILABLE" as const, message: degraded.message, fallbackAllowed: true } : {}),
  };
}

async function callCohere(apiKey: string, prompt: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const to   = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch("https://api.cohere.ai/v2/chat", {
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
    });
  } finally {
    clearTimeout(to);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const body    = req.body as CohereRetrievalInput;
  const diagnosticIds = { pageTruthKey: body?.pageTruthKey ?? null, canonicalUnitId: body?.canonicalUnitId ?? null };

  const apiKey = process.env.COHERE_API_KEY?.trim();
  if (!apiKey) {
    // Always log (not DEV-gated) — a missing key in production is a config error, not routine noise.
    console.error("[COHERE_RETRIEVAL_UNAVAILABLE]", { reason: "COHERE_API_KEY missing", ...diagnosticIds });
    const topicForFallback = String(body?.topic ?? "").trim().slice(0, 300);
    return res.status(200).json(buildFallback(topicForFallback, { message: "Related-reading search is not configured on the server." }));
  }

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

  const startedAt = Date.now();
  try {
    let resp: Response;
    try {
      resp = await callCohere(apiKey, prompt, RETRIEVAL_TIMEOUT_MS);
      // Retry once on a server-side/upstream failure — not on 4xx (our request was bad, retrying won't help).
      if (!resp.ok && resp.status >= 500) {
        console.warn("[COHERE_RETRIEVAL_RETRY]", { ...diagnosticIds, status: resp.status, elapsedMs: Date.now() - startedAt });
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
        resp = await callCohere(apiKey, prompt, RETRIEVAL_TIMEOUT_MS);
      }
    } catch (fetchErr) {
      console.warn("[COHERE_RETRIEVAL_RETRY]", { ...diagnosticIds, error: String(fetchErr), elapsedMs: Date.now() - startedAt });
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      resp = await callCohere(apiKey, prompt, RETRIEVAL_TIMEOUT_MS);
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("[COHERE_RETRIEVAL_FAILED]", {
        ...diagnosticIds,
        status:     resp.status,
        body:       errText.slice(0, 200),
        durationMs: Date.now() - startedAt,
      });
      return res.status(200).json(buildFallback(topic, { message: "Related-reading search is temporarily unavailable." }));
    }

    const data = await resp.json();
    // v2 chat response shape: message.content[0].text
    const raw  = (data?.message?.content?.[0]?.text ?? data?.text ?? "").trim();

    let parsed: { relatedReadings?: string[]; relatedVideos?: string[] } = {};
    try {
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      DEV && console.warn("[COHERE_PARSE_FAIL]", { raw: raw.slice(0, 200) });
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

    DEV && console.log("[COHERE_RETRIEVAL_OK]", {
      ...diagnosticIds,
      topic:        topic.slice(0, 80),
      readingCount: result.relatedReadings.length,
      videoCount:   result.relatedVideos.length,
      durationMs:   Date.now() - startedAt,
    });

    return res.status(200).json(result);

  } catch (err) {
    console.error("[COHERE_RETRIEVAL_FAILED]", { ...diagnosticIds, error: String(err), durationMs: Date.now() - startedAt });
    return res.status(200).json(buildFallback(topic, { message: "Related-reading search is temporarily unavailable." }));
  }
}
