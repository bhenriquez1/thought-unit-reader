// pages/api/resolveResources.ts
// AI-powered specific resource resolver.
// Returns exact article URLs from trusted educational sources and the most relevant
// educational videos — relevance-first, not channel-first.
//
// Articles: NIH, MedlinePlus, NCBI Bookshelf, Merck Manual, OpenStax, CDC, NIDDK, ADA, AAP
// Videos:   Any educational creator — ranked by concept match, not creator prestige.
//
// Article URLs are validated via HEAD request; unresolvable URLs are omitted silently.
// Videos: YouTube API resolves exact videoId + timestamp deep-link when key is present.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

// ── Schemas ────────────────────────────────────────────────────────────────

const ArticleRecSchema = z.object({
  title:   z.string(),          // exact page/article title
  url:     z.string(),          // exact URL, with #fragment anchor when a specific section matches
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

Provide EXACT real URLs that exist on those sites. Include section anchors (#fragment) whenever you know the specific section.

URL patterns:
- NIH ODS: https://ods.od.nih.gov/factsheets/[Nutrient]-HealthProfessional/
- MedlinePlus encyclopedia: https://medlineplus.gov/ency/article/[number].htm
- MedlinePlus topic: https://medlineplus.gov/[topic].html
- NCBI Bookshelf: https://www.ncbi.nlm.nih.gov/books/NBK[number]/ — append #[anchor] for section (e.g. NBK507254/#_article-30305_s3_)
- Merck Manual: https://www.merckmanuals.com/professional/[section]/[topic] — append #v[number] for section anchor when known

Section anchor examples:
- For a thyroid/iodine topic on NCBI Bookshelf, link to the thyroid synthesis section directly
- For a cardiovascular drug on Merck Manual, link to the mechanism-of-action section
- When unsure of the anchor, omit it — a correct base URL is better than a broken anchor

VIDEO SOURCES — RELEVANCE-FIRST RANKING:
Do NOT pick videos based on creator prestige. Pick the video that best explains THIS SPECIFIC concept.

Ranking factors (must all be considered when scoring 0–100):
  1. Concept match (40%) — Does the video title/description directly match the exact mechanism or topic?
  2. Educational quality (20%) — Clear explanation, good visuals, appropriate depth for med/dental students
  3. Timestamp relevance (20%) — Can you provide a timestamp where the specific concept is discussed?
  4. Engagement / authority (10%) — Views, likes, subscriber count signal quality
  5. Creator reputation (10%) — Is the creator known for accuracy in this subject area?

ANY educational creator may be recommended. Examples (not exhaustive):
- Ninja Nerd (@NinjaNerdNation) — physiology, pathology, mechanisms
- Osmosis (@osmosis) — disease animations, pharmacology
- Khan Academy (@khanacademy) — science, pre-med, biochemistry
- Armando Hasudungan (@armandohasudungan) — hand-drawn immunology, hematology, microbiology
- Medicosis Perfectionalis (@MedicosisPerfectionalis) — high-yield med school concepts
- Professor Leonard (@ProfessorLeonard) — calculus, differential equations, mathematics
- MIT OpenCourseWare (@mitocw) — university-level science and engineering
- Boards & Beyond (@BoardsBeyond) — board-focused medical content
- Crash Course (@thecrashcourse) — accessible science overviews
- University lecture channels (e.g., @StanfordMedicine, @UCBerkeleyOfficial)
- Specialty clinical channels when most relevant to the topic

IMPORTANT VIDEO RULES:
- Recommend the MOST SPECIFIC video covering the exact mechanism — not a general topic overview
- Provide channelHandle as the YouTube @handle (e.g. "@NinjaNerdNation")
- If you know the timestamp where the specific concept is explained, always provide it
- A highly-relevant video from a lesser-known creator beats a general video from a famous creator
- Score: 90–100 = perfect match on exact mechanism; 70–89 = strong match; 50–69 = partial match`;

// ── URL validation ─────────────────────────────────────────────────────────

async function isUrlReachable(url: string): Promise<boolean> {
  try {
    // Validate only the base URL (strip #fragment) — servers don't return 404 for bad anchors
    const baseUrl = url.split("#")[0];
    const res = await fetch(baseUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(3500),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; resource-validator/1.0)" },
    });
    return res.ok || res.status === 405; // 405 = HEAD not allowed, but URL exists
  } catch {
    return false;
  }
}

// ── YouTube channel IDs (needed for channelId filter in YouTube search API) ──
const YOUTUBE_CHANNEL_IDS: Record<string, string> = {
  "@NinjaNerdNation":          "UC6QYFutt9cluQ3uSM963_KQ",
  "@osmosis":                  "UCNI0qbn7X6mMd8V9UcDiO-A",
  "@khanacademy":              "UC4a-Gbdw7vOaccHmFo40b9g",
  "@BoardsBeyond":             "UCcoMpPC8OkNnwHCNRLKXLiA",
  "@thecrashcourse":           "UCX6b17PVsYBQ0ip5gyeme-Q",
  "@armandohasudungan":        "UCesEknt3SRX9R9W_f93Tb7g",
  "@MedicosisPerfectionalis":  "UCawHPSNMIGSJeS4C-H66Mdg",
};

// ── Resolve one video to an actual YouTube URL via YouTube Data API v3 ─────

interface YouTubeVideoResult {
  videoId: string;
  title: string;
  channelTitle: string;
}

async function resolveVideoViaYouTubeApi(
  channelHandle: string,
  searchQuery: string,
  apiKey: string
): Promise<YouTubeVideoResult | null> {
  const channelId = YOUTUBE_CHANNEL_IDS[channelHandle];
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "1",
    q: searchQuery,
    key: apiKey,
    ...(channelId ? { channelId } : {}),
  });
  try {
    const resp = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`,
      { signal: AbortSignal.timeout(4500) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const item = data.items?.[0];
    if (!item) return null;
    return {
      videoId:      item.id.videoId,
      title:        item.snippet.title,
      channelTitle: item.snippet.channelTitle,
    };
  } catch {
    return null;
  }
}

// ── YouTube channel search URL builder (fallback when no API key) ──────────

function buildVideoSearchUrl(handle: string, query: string): string {
  if (handle.startsWith("@")) {
    return `https://www.youtube.com/${handle}/search?query=${encodeURIComponent(query)}`;
  }
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
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

  console.log("[RELATED_SEARCH_QUERY]", {
    thesis:       pageThesis.slice(0, 100),
    mechanism:    keyMechanism?.slice(0, 60) ?? null,
    conceptCount: conceptTitles.length,
  });

  const topicLines = [
    `PAGE THESIS: ${pageThesis}`,
    keyMechanism ? `KEY MECHANISM: ${keyMechanism}` : null,
    conceptTitles.length ? `KEY CONCEPTS: ${conceptTitles.slice(0, 5).join(", ")}` : null,
    anchorTexts.length   ? `KEY TERMS: ${anchorTexts.slice(0, 4).join(" | ")}` : null,
  ].filter(Boolean).join("\n");

  const userPrompt = `${topicLines}

Return:
- 2–3 article recommendations from the approved sources above (EXACT real URLs)
- 3–4 video recommendations ranked by relevance to the specific mechanism above

For videos: apply the relevance-first ranking factors. Provide timestamps wherever possible.
Score each 0–100. Best match on the exact mechanism scores highest regardless of creator.`;

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

    // [DIAGNOSIS] Log raw article URLs from OpenAI before any URL validation
    console.log("[RELATED_SOURCE_URLS]", {
      articleCount:   data.articles.length,
      articleUrls:    data.articles.map(a => ({ url: a.url, source: a.source, score: a.score })),
      videoCount:     data.videos.length,
      videoQueries:   data.videos.map(v => ({ channel: v.channel, handle: v.channelHandle, q: v.searchQuery, score: v.score })),
    });

    // Validate article URLs in parallel — omit any that are unreachable
    const articleChecks = await Promise.all(
      data.articles.map(async (a) => {
        const ok = await isUrlReachable(a.url);
        if (ok) {
          console.log("[RELATED_URL_VALIDATED]", { url: a.url, source: a.source });
        } else {
          console.log("[RELATED_URL_REJECTED]", { url: a.url, source: a.source, reason: "HEAD check failed" });
        }
        return ok ? a : null;
      })
    );
    const articles: ResolvedArticle[] = articleChecks
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .map(a => ({ title: a.title, url: a.url, source: a.source, reason: a.reason, score: a.score }));

    // Resolve videos — use YouTube API when key present for exact video IDs + timestamp links
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    const videoResults = await Promise.all(
      data.videos.map(async (v) => {
        let searchUrl = buildVideoSearchUrl(v.channelHandle, v.searchQuery);
        let videoTitle = v.videoTitle;

        if (youtubeApiKey) {
          const resolved = await resolveVideoViaYouTubeApi(v.channelHandle, v.searchQuery, youtubeApiKey);
          if (resolved) {
            videoTitle = resolved.title;
            // Add timestamp deep-link if the AI provided a timestamp
            const tParam = v.timestampSeconds ? `&t=${Math.floor(v.timestampSeconds)}s` : "";
            searchUrl = `https://www.youtube.com/watch?v=${resolved.videoId}${tParam}`;
            console.log("[RESOURCES:video-resolved]", { channel: v.channel, videoId: resolved.videoId, timestamp: v.timestampLabel });
          } else {
            console.log("[RESOURCES:video-fallback]", { channel: v.channel, query: v.searchQuery });
          }
        }

        return {
          channel:          v.channel,
          channelHandle:    v.channelHandle,
          videoTitle,
          searchUrl,
          reason:           v.reason,
          timestampSeconds: v.timestampSeconds,
          timestampLabel:   v.timestampLabel,
          score:            v.score,
        } satisfies ResolvedVideo;
      })
    );
    let videos: ResolvedVideo[] = videoResults;

    // ── Cohere rerank: semantically re-sort articles and videos by relevance ──
    const cohereKey = process.env.COHERE_API_KEY?.trim();
    const thesis = body.pageThesis?.trim() ?? "";
    if (cohereKey && thesis && (articles.length > 1 || videos.length > 1)) {
      try {
        const cohereCtrl = new AbortController();
        const cohereTimeout = setTimeout(() => cohereCtrl.abort(), 8_000);

        // Rerank articles
        if (articles.length > 1) {
          const artDocs = articles.map(a => `${a.title}. ${a.reason}. Source: ${a.source}`);
          const artResp = await fetch("https://api.cohere.ai/v1/rerank", {
            signal: cohereCtrl.signal,
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${cohereKey}` },
            body: JSON.stringify({ model: "rerank-english-v3.0", query: thesis, documents: artDocs, top_n: artDocs.length }),
          }).catch(() => null);
          if (artResp?.ok) {
            const artData = await artResp.json();
            const ranked = artData?.results as Array<{ index: number; relevance_score: number }> | undefined;
            if (ranked?.length) {
              const reranked = ranked.map(r => ({ ...articles[r.index], score: Math.round(r.relevance_score * 100) }));
              articles.splice(0, articles.length, ...reranked);
              console.log("[COHERE_RERANK_ARTICLES]", { count: reranked.length, topScore: reranked[0]?.score });
            }
          }
        }

        // Rerank videos
        if (videos.length > 1) {
          const vidDocs = videos.map(v => `${v.videoTitle}. ${v.reason}. Channel: ${v.channel}`);
          const vidResp = await fetch("https://api.cohere.ai/v1/rerank", {
            signal: cohereCtrl.signal,
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${cohereKey}` },
            body: JSON.stringify({ model: "rerank-english-v3.0", query: thesis, documents: vidDocs, top_n: vidDocs.length }),
          }).catch(() => null);
          if (vidResp?.ok) {
            const vidData = await vidResp.json();
            const ranked = vidData?.results as Array<{ index: number; relevance_score: number }> | undefined;
            if (ranked?.length) {
              videos = ranked.map(r => ({ ...videos[r.index], score: Math.round(r.relevance_score * 100) }));
              console.log("[COHERE_RERANK_VIDEOS]", { count: videos.length, topScore: videos[0]?.score });
            }
          }
        }

        clearTimeout(cohereTimeout);
      } catch (cohereErr) {
        console.warn("[COHERE_RERANK_SKIP]", String(cohereErr));
      }
    }

    console.log("[RELATED_COHERE_RANKED]", {
      articleCount:    articles.length,
      videoCount:      videos.length,
      topArticleUrl:   articles[0]?.url ?? null,
      topVideoChannel: videos[0]?.channel ?? null,
    });

    console.log("[RESOURCES:done]", {
      articlesValidated: articles.length,
      articlesRequested: data.articles.length,
      videos: videos.length,
      cohereReranked: !!cohereKey,
    });

    return res.status(200).json({ articles, videos } satisfies ResourcesResponse);

  } catch (err) {
    console.error("[RESOURCES:error]", err instanceof Error ? err.message : err);
    return res.status(200).json({ articles: [], videos: [] });
  }
}
