// pages/api/resolveResources.ts
// AI-powered specific resource resolver.
// Returns exact article URLs from trusted educational sources and channel-specific
// video recommendations — never generic search result pages.
//
// Articles: NIH, MedlinePlus, NCBI Bookshelf, Merck Manual, OpenStax, CDC, NIDDK, ADA, AAP
// Videos:   Ninja Nerd, Osmosis, Khan Academy, Boards & Beyond, Crash Course, Armando Hasudungan
//
// Article URLs are validated via HEAD request; unresolvable URLs are omitted silently.
// Videos without a YouTube API key → channel-specific search URL (never generic YouTube search).

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

// ── Schemas ────────────────────────────────────────────────────────────────

const ArticleRecSchema = z.object({
  title:   z.string(),          // exact page/article title
  url:     z.string(),          // exact URL on the trusted source
  source:  z.string(),          // "NIH ODS", "MedlinePlus", "NCBI Bookshelf", etc.
  reason:  z.string(),          // ≤ 12 words: why directly relevant
  score:   z.number().int(),    // 0–100
});

const VideoRecSchema = z.object({
  channel:         z.string(), // "Ninja Nerd", "Khan Academy", etc.
  channelHandle:   z.string(), // "@NinjaNerdNation", "@khanacademy", etc.
  videoTitle:      z.string(), // specific video title
  searchQuery:     z.string(), // precise search terms to find this video on the channel
  reason:          z.string(), // ≤ 12 words: why directly relevant
  timestampSeconds: z.number().nullable(), // best timestamp in seconds (null if unknown)
  timestampLabel:  z.string().nullable(),  // "12:42" (null if unknown)
  score:           z.number().int(),       // 0–100
});

const ResourcesSchema = z.object({
  articles: z.array(ArticleRecSchema),
  videos:   z.array(VideoRecSchema),
});

let FORMAT: ReturnType<typeof zodTextFormat> | null = null;
try {
  FORMAT = zodTextFormat(ResourcesSchema, "resource_recommendations");
} catch (e) {
  console.error("[RESOURCES:init:SCHEMA_FAIL]", e);
}

// ── Request / Response types ───────────────────────────────────────────────

export interface ResourcesRequest {
  pageThesis:    string;
  keyMechanism?: string | null;
  conceptTitles?: string[];
  anchorTexts?:  string[];
  domain?:       string;
}

export interface ResolvedArticle {
  title:   string;
  url:     string;
  source:  string;
  reason:  string;
  score:   number;
}

export interface ResolvedVideo {
  channel:          string;
  channelHandle:    string;
  videoTitle:       string;
  searchUrl:        string;   // channel-specific search or exact YouTube URL
  reason:           string;
  timestampSeconds: number | null;
  timestampLabel:   string | null;
  score:            number;
}

export interface ResourcesResponse {
  articles: ResolvedArticle[];
  videos:   ResolvedVideo[];
}

// ── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a medical and science education resource specialist.

Given a study topic, recommend specific high-quality resources for medical, dental, and pre-health students.

ARTICLE SOURCES (use ONLY these — do NOT use Wikipedia):
Priority order:
1. NIH Office of Dietary Supplements — ods.od.nih.gov/factsheets/
2. MedlinePlus — medlineplus.gov (drugs, conditions, encyclopedia)
3. NCBI Bookshelf — ncbi.nlm.nih.gov/books/
4. Merck Manual Professional — merckmanuals.com/professional
5. OpenStax — openstax.org/books/
6. NIH subagencies — niddk.nih.gov, nhlbi.nih.gov, cancer.gov, nlm.nih.gov
7. CDC — cdc.gov
8. ADA (dental) — ada.org or evidence.ada.org
9. AAP (pediatrics) — healthychildren.org or aap.org
10. University medical school pages (e.g., lecturio.com, amboss.com public pages)

Provide EXACT real URLs that exist on those sites. NIH ODS factsheet URLs follow the pattern:
https://ods.od.nih.gov/factsheets/[Nutrient]-HealthProfessional/
MedlinePlus encyclopedia: https://medlineplus.gov/ency/article/[number].htm
NCBI Bookshelf: https://www.ncbi.nlm.nih.gov/books/NBK[number]/
Merck Manual: https://www.merckmanuals.com/professional/[section]/[topic]

VIDEO SOURCES (use ONLY these channels — in priority order):
1. Ninja Nerd — @NinjaNerdNation — excellent medical physiology and pathology
2. Osmosis — @osmosis — clear disease mechanism animations
3. Khan Academy — @khanacademy — solid science and pre-med content
4. Boards & Beyond — @BoardsBeyond — board-focused medical content
5. Crash Course — @thecrashcourse — accessible science overviews
6. Armando Hasudungan — @armandohasudungan — hand-drawn medical diagrams

For each video: recommend the MOST SPECIFIC video on that channel covering this exact topic.
If you know the approximate timestamp where the specific mechanism/concept is explained, provide it.
Score videos 50–100 based on how directly they cover the exact mechanism.`;

// ── URL validation ─────────────────────────────────────────────────────────

async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(3500),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; resource-validator/1.0)" },
    });
    return res.ok || res.status === 405; // 405 = HEAD not allowed, but URL exists
  } catch {
    return false;
  }
}

// ── YouTube channel search URL builder ────────────────────────────────────

function buildVideoSearchUrl(handle: string, query: string): string {
  if (!handle.startsWith("@")) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }
  return `https://www.youtube.com/${handle}/search?query=${encodeURIComponent(query)}`;
}

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "HEAD") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  if (!apiKey)    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  if (!FORMAT)    return res.status(500).json({ error: "Schema init failed" });

  const body = req.body as Partial<ResourcesRequest>;
  const { pageThesis, keyMechanism, conceptTitles = [], anchorTexts = [] } = body;

  if (!pageThesis?.trim()) {
    return res.status(400).json({ error: "pageThesis required" });
  }

  const topicLines = [
    `PAGE THESIS: ${pageThesis}`,
    keyMechanism ? `KEY MECHANISM: ${keyMechanism}` : null,
    conceptTitles.length ? `KEY CONCEPTS: ${conceptTitles.slice(0, 5).join(", ")}` : null,
    anchorTexts.length   ? `KEY TERMS: ${anchorTexts.slice(0, 4).join(" | ")}` : null,
  ].filter(Boolean).join("\n");

  const userPrompt = `${topicLines}

Return:
- 2–3 article recommendations from the approved sources above (EXACT real URLs)
- 2–3 video recommendations from the approved channels above

Score each 50–100. Prioritize most directly relevant to the specific mechanism described.`;

  try {
    const response = await openai.responses.parse({
      model: "gpt-4o",
      temperature: 0.2,
      max_output_tokens: 900,
      text: { format: FORMAT },
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userPrompt },
      ],
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      console.error("[RESOURCES:null-output]");
      return res.status(200).json({ articles: [], videos: [] });
    }

    const raw = ResourcesSchema.safeParse(parsed);
    if (!raw.success) {
      console.error("[RESOURCES:parse-fail]", raw.error.message);
      return res.status(200).json({ articles: [], videos: [] });
    }

    const data = raw.data;

    // Validate article URLs in parallel — omit any that are unreachable
    const articleChecks = await Promise.all(
      data.articles.map(async (a) => {
        const ok = await isUrlReachable(a.url);
        console.log("[RESOURCES:url-check]", { url: a.url, ok });
        return ok ? a : null;
      })
    );
    const articles: ResolvedArticle[] = articleChecks
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .map(a => ({ title: a.title, url: a.url, source: a.source, reason: a.reason, score: a.score }));

    // Build video search URLs — channel-specific search (no hallucinated video IDs)
    const videos: ResolvedVideo[] = data.videos.map(v => ({
      channel:          v.channel,
      channelHandle:    v.channelHandle,
      videoTitle:       v.videoTitle,
      searchUrl:        buildVideoSearchUrl(v.channelHandle, v.searchQuery),
      reason:           v.reason,
      timestampSeconds: v.timestampSeconds,
      timestampLabel:   v.timestampLabel,
      score:            v.score,
    }));

    console.log("[RESOURCES:done]", {
      articlesValidated: articles.length,
      articlesRequested: data.articles.length,
      videos: videos.length,
    });

    return res.status(200).json({ articles, videos } satisfies ResourcesResponse);

  } catch (err) {
    console.error("[RESOURCES:error]", err instanceof Error ? err.message : err);
    return res.status(200).json({ articles: [], videos: [] });
  }
}
