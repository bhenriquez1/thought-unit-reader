// pages/api/elena-vocab.ts
// Vocabulary Extractor — pulls age-appropriate words from a PDF page and
// returns child-friendly definitions + example sentences.
//
// Security: ALL user-supplied values (pageText, bookTitle, currentPage) go into
// the messages array, never into the system prompt. The system prompt is
// 100% developer-authored static text. This pattern prevents CodeQL CWE-1336.

const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import type { VocabExtractRequest, VocabExtractResponse, VocabExtractedWord } from "@/lib/elena/vocabulary";
import type { ChildAgeRange } from "@/lib/elena/types";

const DEV = process.env.NODE_ENV === "development";

export const config = {
  maxDuration: 25,
  api: { bodyParser: { sizeLimit: "128kb" } },
};

/* ─── Age → vocabulary level ─────────────────────────────────────────────────── */

function ageVocabLevel(range: ChildAgeRange | undefined): string {
  switch (range) {
    case "3-4":   return "ages 3-4 (pre-K): very simple 1-2 syllable words only";
    case "5-6":   return "ages 5-6 (kindergarten): simple, common words";
    case "7-8":   return "ages 7-8 (grades 1-2): words slightly above everyday vocabulary";
    case "9-10":  return "ages 9-10 (grades 3-4): words that enrich reading comprehension";
    case "11-12": return "ages 11-12 (grades 5-6): richer vocabulary including subject-specific terms";
    default:      return "elementary school level: clear, useful words";
  }
}

/* ─── Static system prompt (100% developer-authored — no user-controlled data) ── */

// Age-level framing is injected into the user message (messages array), not here,
// so this constant stays fully static and satisfies CWE-1336.
const VOCAB_SYSTEM = `You are a vocabulary educator for young readers. Use the age-appropriate level specified in the user's message.

Extract 3 to 5 vocabulary words from the page content the user provides.

Rules:
- Choose words that are interesting, useful, or slightly challenging for this age group.
- Skip very common words (like "the", "said", "went") unless they have an unusual meaning in context.
- Skip proper nouns (character names, place names) unless they carry important meaning.
- Definitions must be simple, warm, and child-friendly — no dictionary jargon.
- Each example sentence must be a new, original sentence (not copied from the text).
- Choose one relevant emoji per word.

Respond ONLY with valid JSON — no markdown fences, no prose before or after:
{
  "words": [
    {
      "word": "...",
      "definition": "...",
      "exampleSentence": "...",
      "emoji": "..."
    }
  ]
}`;

/* ─── Context in messages (never in system) ──────────────────────────────────── */

function buildMessages(body: VocabExtractRequest): Anthropic.MessageParam[] {
  const bookLabel = (body.bookTitle ?? "").trim() || "their book";
  // Age-level framing goes here (in the messages array), not in the system prompt (CWE-1336).
  let ctx = `Age level: ${ageVocabLevel(body.ageRange)}\n\nExtract vocabulary words from this page`;
  if (body.bookTitle) ctx += ` of "${bookLabel}"`;
  if (body.currentPage) ctx += ` (page ${body.currentPage})`;
  ctx += `:\n\n<page_content>\n${body.pageText}\n</page_content>`;

  return [
    { role: "user",      content: ctx },
    { role: "assistant", content: '{"words":[' },
  ];
}

/* ─── Validation ─────────────────────────────────────────────────────────────── */

const VALID_AGE_RANGES = new Set<string>(["3-4", "5-6", "7-8", "9-10", "11-12"]);

function sanitise(body: VocabExtractRequest): VocabExtractRequest {
  return {
    pageText:    (body.pageText ?? "").slice(0, 3000),
    ageRange:    VALID_AGE_RANGES.has(body.ageRange ?? "") ? body.ageRange : undefined,
    bookTitle:   body.bookTitle?.slice(0, 120),
    currentPage: typeof body.currentPage === "number" ? body.currentPage : undefined,
  };
}

/* ─── Handler ────────────────────────────────────────────────────────────────── */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VocabExtractResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ words: [], error: "Method Not Allowed" });
  }

  const raw = req.body as VocabExtractRequest;
  if (!raw?.pageText?.trim()) {
    return res.status(400).json({ words: [], error: "pageText is required" });
  }

  const body = sanitise(raw);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(503).json({ words: [], error: "Vocabulary feature is not available right now." });
  }

  try {
    const client   = new Anthropic({ apiKey: anthropicKey });
    const system   = VOCAB_SYSTEM;
    const messages = buildMessages(body);

    const result = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system,
      messages,
    });

    const raw_text = result.content[0]?.type === "text" ? result.content[0].text.trim() : "";

    // Reconstruct JSON (we prefilled the assistant turn with '{"words":[')
    const jsonStr = '{"words":[' + raw_text;
    let words: VocabExtractedWord[] = [];
    try {
      const parsed = JSON.parse(jsonStr) as { words: VocabExtractedWord[] };
      words = (parsed.words ?? []).filter(
        (w) => typeof w.word === "string" && typeof w.definition === "string"
      ).slice(0, 5);
    } catch {
      DEV && console.error("[ELENA_VOCAB] JSON parse failed:", jsonStr.slice(0, 200));
      return res.status(500).json({ words: [], error: "Could not understand the response. Try again!" });
    }

    DEV && console.log("[ELENA_VOCAB]", { page: body.currentPage ?? null, wordCount: words.length });
    return res.status(200).json({ words });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    DEV && console.error("[ELENA_VOCAB_ERROR]", msg);
    return res.status(502).json({ words: [], error: "Vocabulary helper is having trouble. Try again!" });
  }
}
