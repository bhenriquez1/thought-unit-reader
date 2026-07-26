const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import {
  CoreExtractResponseSchema,
  type CoreExtractRequest,
  type CoreExtractResponse,
  type CoreConcept,
} from "@/lib/coreConceptSchema";
import { isBoilerplate } from "@/lib/core/boilerplateFilter";

// ============================================================================
// Cache (in-memory, keyed by textHash)
// ============================================================================

const cache = new Map<string, CoreExtractResponse>();
const MAX_CACHE = 200;

function textHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// ============================================================================
// Tag detection heuristics
// ============================================================================

type Tag = CoreConcept["tags"][number];

function detectTags(text: string): Tag[] {
  const tags: Tag[] = [];
  if (/\bis\s+(defined\s+as|a|an|the)\b|\bmeans\b|\brefers\s+to\b/i.test(text))
    tags.push("definition");
  if (/\bstep|procedure|first.*then|process\b/i.test(text))
    tags.push("process");
  if (/\bif\b.*\bthen\b|\brule\b|\bmust\b|\bshould\b|\bwhen\b/i.test(text))
    tags.push("rule");
  if (/\bexample\b|\be\.g\.\b|\bsuch as\b|\binstance\b/i.test(text))
    tags.push("example");
  if (/\btrap\b|\bmistake\b|\bavoid\b|\bconfuse\b|\bpitfall\b|\bexcept\b/i.test(text))
    tags.push("pitfall");
  return tags.slice(0, 3);
}

function detectExamWeight(text: string): 1 | 2 | 3 | 4 | 5 {
  let score = 2;
  if (/\bdefinition\b|\bdefined\b|\bmeans\b/i.test(text)) score += 1;
  if (/\brule\b|\blaw\b|\btheorem\b|\bprinciple\b/i.test(text)) score += 2;
  if (/\bif\b.*\bthen\b|\bwhen\b.*\bmust\b/i.test(text)) score += 1;
  if (/\bformula\b|\bcalculate\b|\bequation\b/i.test(text)) score += 1;
  return Math.min(5, Math.max(1, score)) as 1 | 2 | 3 | 4 | 5;
}

function detectConfidence(text: string): 0 | 1 | 2 | 3 {
  // Longer, more specific sentences → higher confidence
  if (text.length > 100 && /\b(is|are|means|defined)\b/i.test(text)) return 3;
  if (text.length > 60) return 2;
  if (text.length > 30) return 1;
  return 0;
}

function generateLabel(text: string): string {
  // Extract first few meaningful words as label
  const cleaned = text.replace(/^(the|a|an|in|on|at|for|to|is|are|was|were)\s+/gi, "");
  const words = cleaned.split(/\s+/).slice(0, 5);
  const label = words.join(" ");
  return label.length > 64 ? label.slice(0, 61) + "..." : label;
}

// ============================================================================
// Mock extraction (clause-based)
// ============================================================================

function extractConcepts(
  windowText: string,
  page: number,
  windowIndex: number,
  docId: string
): CoreConcept[] {
  // Split into paragraphs, filter boilerplate
  const paragraphs = windowText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !isBoilerplate(p));

  // Split paragraphs into sentences (clauses)
  const clauses: { text: string; pIdx: number; cIdx: number }[] = [];
  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const sentences = paragraphs[pIdx]
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 15);
    for (let cIdx = 0; cIdx < sentences.length; cIdx++) {
      clauses.push({ text: sentences[cIdx], pIdx, cIdx });
    }
  }

  if (clauses.length === 0) return [];

  // Score and rank
  const scored = clauses.map((c) => ({
    ...c,
    score: detectExamWeight(c.text) + detectConfidence(c.text),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Take top 8
  const top = scored.slice(0, 8);

  return top.map((c, i) => {
    const oneLiner = c.text.length > 220 ? c.text.slice(0, 217) + "..." : c.text;
    const id = `cc_${docId.slice(0, 8)}_p${page}_w${windowIndex}_${i}`;

    return {
      id,
      label: generateLabel(c.text),
      oneLiner,
      anchors: [
        {
          quote: c.text.slice(0, 140),
          locator: {
            page,
            windowIndex,
            charStart: 0,
            charEnd: Math.min(c.text.length, 140),
          },
        },
      ],
      tags: detectTags(c.text),
      examWeight: detectExamWeight(c.text),
      confidence: detectConfidence(c.text),
    };
  });
}

// ============================================================================
// API Handler
// ============================================================================

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const startMs = Date.now();

  try {
    const body = req.body as CoreExtractRequest;

    if (!body.windowText || body.windowText.trim().length < 10) {
      return res.status(200).json({
        meta: {
          docId: body.docId || "",
          page: body.page || 1,
          windowIndex: body.windowIndex || 0,
          mode: body.mode || "page_window",
          textHash: "",
          ms: Date.now() - startMs,
        },
        concepts: [],
        errors: [{ code: "NO_TEXT", message: "Insufficient text for extraction" }],
      });
    }

    const hash = textHash(body.windowText);

    // Check cache
    const cached = cache.get(hash);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Extract
    const concepts = extractConcepts(
      body.windowText,
      body.page,
      body.windowIndex,
      body.docId
    );

    const response: CoreExtractResponse = {
      meta: {
        docId: body.docId,
        page: body.page,
        windowIndex: body.windowIndex,
        mode: body.mode || "page_window",
        textHash: hash,
        ms: Date.now() - startMs,
      },
      concepts,
    };

    // Validate with Zod
    const validated = CoreExtractResponseSchema.safeParse(response);
    if (!validated.success) {
      DEV && console.error("Core extract validation failed:", validated.error);
      // Return truncated safe response
      response.concepts = response.concepts.slice(0, 8);
    }

    // Cache
    if (cache.size >= MAX_CACHE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(hash, response);

    return res.status(200).json(response);
  } catch (error) {
    DEV && console.error("Core extract error:", error);
    return res.status(500).json({
      error: "EXTRACTION_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
