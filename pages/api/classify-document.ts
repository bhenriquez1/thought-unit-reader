// pages/api/classify-document.ts
// Book Intelligence — classifies an uploaded document to answer two questions:
//   1. What is this document? (BookClassification)
//   2. How should it be learned? (LearningCharacteristics)
//
// Also infers complexity and selects the appropriate domain reasoning strategy.
//
// Called once per document after enough text is available (title page, TOC,
// chapter headings, first-page samples). Result is stored in IDB by the client
// and consumed by all downstream panels. This route never touches user state or
// learner history — classification is purely document-driven.
//
// Provider order: OpenAI (primary) → Anthropic (fallback).

const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BookIntelligence,
  BookClassification,
  LearningCharacteristics,
  BookComplexity,
  ClassificationEvidence,
  ClassificationStatus,
  Domain,
  DocumentType,
  InstructionalStyle,
} from "@/lib/bookIntelligence/types";
import {
  BOOK_INTELLIGENCE_VERSION,
  CLASSIFICATION_THRESHOLDS,
} from "@/lib/bookIntelligence/types";
import { getReasoningStrategy } from "@/lib/bookIntelligence/reasoningStrategies";

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: "256kb" } },
};

/* ─── Request / Response types ───────────────────────────────────────────── */

export interface ClassifyDocumentRequest {
  documentId: string;
  /** Title page text if available */
  titlePage?: string;
  /** Raw TOC text (chapter/section names) */
  toc?: string;
  /** First few chapter titles */
  chapterTitles?: string[];
  /** Representative heading strings from across the document */
  headings?: string[];
  /** Sample text from the first pages (up to ~1500 chars) */
  pageSample?: string;
  /** Glossary terms if available */
  glossaryTerms?: string[];
  /** Any existing metadata (filename, PDF title field, etc.) */
  metadata?: { title?: string; subject?: string; keywords?: string };
}

export interface ClassifyDocumentResponse {
  intelligence: BookIntelligence;
  provider: "openai" | "anthropic";
  error?: string;
}

/* ─── Prompt builder ─────────────────────────────────────────────────────── */

function buildPrompt(body: ClassifyDocumentRequest): string {
  const parts: string[] = [];

  if (body.metadata?.title)    parts.push(`TITLE: ${body.metadata.title}`);
  if (body.metadata?.subject)  parts.push(`SUBJECT METADATA: ${body.metadata.subject}`);
  if (body.metadata?.keywords) parts.push(`KEYWORDS METADATA: ${body.metadata.keywords}`);
  if (body.titlePage)          parts.push(`TITLE PAGE:\n${body.titlePage.slice(0, 400)}`);
  if (body.toc)                parts.push(`TABLE OF CONTENTS:\n${body.toc.slice(0, 800)}`);
  if (body.chapterTitles?.length)
    parts.push(`CHAPTER TITLES:\n${body.chapterTitles.slice(0, 20).join("\n")}`);
  if (body.headings?.length)
    parts.push(`HEADINGS SAMPLE:\n${body.headings.slice(0, 30).join("\n")}`);
  if (body.pageSample)
    parts.push(`PAGE TEXT SAMPLE:\n${body.pageSample.slice(0, 1200)}`);
  if (body.glossaryTerms?.length)
    parts.push(`GLOSSARY TERMS:\n${body.glossaryTerms.slice(0, 20).join(", ")}`);

  return parts.join("\n\n");
}

const SYSTEM_PROMPT = `You are a document intelligence classifier. Given document evidence, you classify what the document is and how it should be learned.

Return ONLY a JSON object with this exact structure — no markdown, no prose:

{
  "primaryDomain": string,
  "secondaryDomains": string[],
  "documentType": "textbook"|"atlas"|"board-review"|"certification-manual"|"lecture-notes"|"lab-manual"|"research-paper"|"technical-documentation"|"standards-specification"|"user-manual"|"novel"|"religious-text"|"government-publication"|"mixed"|"unknown",
  "instructionalStyle": "textbook"|"reference"|"review"|"manual"|"lecture-notes"|"research"|"narrative"|"mixed",
  "confidence": number (0-1),
  "evidence": [
    { "signal": string, "excerpt": string (≤80 chars), "weight": number (0-1) }
  ],
  "learningCharacteristics": {
    "prerequisiteHeavy": number (0-1),
    "conceptDense": number (0-1),
    "procedureHeavy": number (0-1),
    "calculationHeavy": number (0-1),
    "memorizationHeavy": number (0-1),
    "caseBased": number (0-1),
    "visualHeavy": number (0-1),
    "discussionHeavy": number (0-1)
  },
  "complexity": "introductory"|"intermediate"|"advanced"|"expert",
  "complexityConfidence": number (0-1)
}

Rules:
- primaryDomain: use canonical names (medicine, dentistry, chemistry, organic-chemistry, computer-science, law, history, etc.). Use "multidisciplinary" when evidence strongly supports more than one domain. Use "unknown" only when no reliable signal exists.
- secondaryDomains: list additional domains when the document genuinely spans them. Empty array if none.
- evidence: include 2-5 of the most informative signals with brief excerpts. Weight reflects how strongly each signal influenced the classification.
- learningCharacteristics: derive from content signals, not from domain assumption. An anatomy atlas is visualHeavy regardless of whether the reader is a medical or dental student.
- complexity: infer from vocabulary, assumed prior knowledge, and depth of treatment. "introductory" assumes no prerequisites; "expert" assumes graduate-level domain fluency.
- If evidence is insufficient, lower confidence and still return your best estimate — never refuse to classify.`;

/* ─── Response parser ────────────────────────────────────────────────────── */

const VALID_DOCUMENT_TYPES: DocumentType[] = [
  "textbook","atlas","board-review","certification-manual","lecture-notes",
  "lab-manual","research-paper","technical-documentation","standards-specification",
  "user-manual","novel","religious-text","government-publication","mixed","unknown",
];
const VALID_INSTRUCTIONAL_STYLES: InstructionalStyle[] = [
  "textbook","reference","review","manual","lecture-notes","research","narrative","mixed",
];
const VALID_COMPLEXITIES: BookComplexity[] = [
  "introductory","intermediate","advanced","expert",
];

/** Clamp a value to [0, 1]; default to 0.5 when not a number. */
function clamp01(v: unknown): number {
  return typeof v === "number" ? Math.min(1, Math.max(0, v)) : 0.5;
}

function deriveClassificationStatus(confidence: number, evidenceCount: number): ClassificationStatus {
  if (confidence >= CLASSIFICATION_THRESHOLDS.classified && evidenceCount > 0) return "classified";
  if (confidence >= CLASSIFICATION_THRESHOLDS.provisional) return "provisional";
  return "insufficient-evidence";
}

/**
 * Parse and normalize a raw AI response string into a BookIntelligence record.
 * Returns null only if the JSON is entirely unparseable — all other problems
 * are normalized to safe defaults.
 */
export function parseAiResponse(raw: string, documentId: string): BookIntelligence | null {
  let j: any;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }

  const primaryDomain: Domain =
    typeof j.primaryDomain === "string" && j.primaryDomain.trim()
      ? (j.primaryDomain.trim() as Domain)
      : "unknown";

  // Deduplicate: remove primaryDomain from secondaryDomains if present
  const rawSecondary: Domain[] = Array.isArray(j.secondaryDomains)
    ? j.secondaryDomains
        .filter((d: any) => typeof d === "string" && d.trim())
        .map((d: string) => d.trim() as Domain)
        .filter((d: Domain) => d !== primaryDomain)
        // Remove duplicate secondary domains
        .filter((d: Domain, i: number, arr: Domain[]) => arr.indexOf(d) === i)
        .slice(0, 5) // cap secondary domains
    : [];

  const confidence = clamp01(j.confidence);

  const evidence: ClassificationEvidence[] = Array.isArray(j.evidence)
    ? j.evidence.slice(0, 8).map((e: any): ClassificationEvidence => ({
        signal: typeof e?.signal === "string" ? e.signal : "page-sample",
        excerpt: String(e?.excerpt ?? "").slice(0, 80),
        weight: clamp01(e?.weight),
      }))
    : [];

  const classification: BookClassification = {
    primaryDomain,
    secondaryDomains: rawSecondary,
    documentType: VALID_DOCUMENT_TYPES.includes(j.documentType) ? j.documentType : "unknown",
    instructionalStyle: VALID_INSTRUCTIONAL_STYLES.includes(j.instructionalStyle)
      ? j.instructionalStyle : "mixed",
    confidence,
    evidence,
  };

  const lc = j.learningCharacteristics ?? {};
  const learningCharacteristics: LearningCharacteristics = {
    prerequisiteHeavy:  clamp01(lc.prerequisiteHeavy),
    conceptDense:       clamp01(lc.conceptDense),
    procedureHeavy:     clamp01(lc.procedureHeavy),
    calculationHeavy:   clamp01(lc.calculationHeavy),
    memorizationHeavy:  clamp01(lc.memorizationHeavy),
    caseBased:          clamp01(lc.caseBased),
    visualHeavy:        clamp01(lc.visualHeavy),
    discussionHeavy:    clamp01(lc.discussionHeavy),
  };

  const complexity: BookComplexity = VALID_COMPLEXITIES.includes(j.complexity)
    ? j.complexity : "intermediate";

  return {
    documentId,
    classification,
    learningCharacteristics,
    complexity,
    complexityConfidence: clamp01(j.complexityConfidence),
    reasoningStrategy: getReasoningStrategy(classification.primaryDomain),
    classificationStatus: deriveClassificationStatus(confidence, evidence.length),
    computedAt: Date.now(),
    version: BOOK_INTELLIGENCE_VERSION,
  };
}

/* ─── Handler ────────────────────────────────────────────────────────────── */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ClassifyDocumentResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ intelligence: null as any, provider: "openai", error: "Method Not Allowed" });
  }

  const body = req.body as ClassifyDocumentRequest;
  if (!body?.documentId) {
    return res.status(400).json({ intelligence: null as any, provider: "openai", error: "documentId is required" });
  }

  const hasEvidence = body.titlePage || body.toc || body.chapterTitles?.length ||
                      body.headings?.length || body.pageSample || body.metadata?.title;
  if (!hasEvidence) {
    return res.status(400).json({ intelligence: null as any, provider: "openai", error: "At least one evidence signal is required" });
  }

  const prompt = buildPrompt(body);
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: 800,
      });
      const raw = completion.choices[0]?.message?.content?.trim() ?? "";
      const intelligence = parseAiResponse(raw, body.documentId);
      if (intelligence) {
        DEV && console.log("[CLASSIFY_DOCUMENT_DONE]", {
          documentId: body.documentId,
          provider: "openai",
          primaryDomain: intelligence.classification.primaryDomain,
          complexity: intelligence.complexity,
          confidence: intelligence.classification.confidence,
          status: intelligence.classificationStatus,
        });
        return res.status(200).json({ intelligence, provider: "openai" });
      }
      // Valid HTTP response but unparseable content — log internally, fall through to Anthropic
      DEV && console.error("[CLASSIFY_DOCUMENT_OPENAI_PARSE_ERROR]", { rawLength: raw.length });
    } catch (err: any) {
      // Log internally; never expose provider error details to the client
      DEV && console.error("[CLASSIFY_DOCUMENT_OPENAI_ERROR]", err?.message ?? String(err));
    }
  }

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });
      const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
      const intelligence = parseAiResponse(raw, body.documentId);
      if (intelligence) {
        DEV && console.log("[CLASSIFY_DOCUMENT_DONE]", {
          documentId: body.documentId,
          provider: "anthropic",
          primaryDomain: intelligence.classification.primaryDomain,
          complexity: intelligence.complexity,
          confidence: intelligence.classification.confidence,
        });
        return res.status(200).json({ intelligence, provider: "anthropic" });
      }
      return res.status(502).json({ intelligence: null as any, provider: "anthropic", error: "Classification provider returned unparseable response" });
    } catch (err: any) {
      DEV && console.error("[CLASSIFY_DOCUMENT_ANTHROPIC_ERROR]", err?.message ?? String(err));
      return res.status(502).json({ intelligence: null as any, provider: "anthropic", error: "Classification provider failed" });
    }
  }

  return res.status(503).json({ intelligence: null as any, provider: "openai", error: "No classification provider configured" });
}
