// pages/api/learning-source-extract.ts
// Extracts high-yield thought units from supplemental study materials (lecture notes,
// articles, videos, research papers) and grounds them against the learner's existing
// textbook concepts.
//
// SECURITY:
//   - OPENAI_API_KEY is server-side only — never sent to the browser.
//   - System prompt is 100% static developer-authored text (CWE-1336).
//   - All user-controlled values (source text, concept list, source label) are placed
//     in the user message only, never injected into the system prompt.
//
// GROUNDING CONSTRAINT (enforced by system prompt):
//   Supplemental material enriches the canonical textbook units.
//   It does NOT silently replace or overwrite any textbook-grounded concept.

import type { NextApiRequest, NextApiResponse } from "next";

const DEV = process.env.NODE_ENV === "development";

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: "1mb" } },
};

type RequestBody = {
  sourceText:     string;    // the learning source content (user-controlled → messages only)
  sourceLabel:    string;    // e.g. "University Lecture" (user-controlled → messages only)
  conceptTitles:  string[];  // textbook concept titles for grounding (user-controlled → messages only)
};

export interface ExtractedThoughtUnitRaw {
  text:         string;
  anchorType:   string;
  reason:       string;
  conceptTitle: string;
  grounding:    string;
}

type ResponseBody =
  | { thoughtUnits: ExtractedThoughtUnitRaw[]; provider: "openai" }
  | { thoughtUnits: ExtractedThoughtUnitRaw[]; provider: "fallback"; error: string };

// ── Static system prompt (100% developer-authored — no user data here) ────────
const SYSTEM = `You are an expert educational content analyst. Your job is to extract high-yield thought units from supplemental study materials and ground each one against a learner's existing textbook concepts.

RULES:
1. Extract only distinct, study-worthy passages — not filler, repetition, or preamble.
2. Each thought unit must add genuine study value: a different angle, a clinical application, a worked example, a memorable analogy, or a deeper mechanism explanation not covered by the textbook alone.
3. Classify each unit's role using one of: coreIdea, mechanism, application, trap, definition, keyDetail, memoryAnchor, formula.
4. reason: ≤10 words explaining why a top student would highlight this.
5. conceptTitle: pick the MOST RELEVANT concept from the provided textbook concept list. If none match, use "General".
6. grounding: ONE sentence explaining how this passage connects to or reinforces the chosen textbook concept.

ENRICHMENT CONSTRAINT (non-negotiable):
This supplemental material enriches the learner's textbook — it does NOT replace it.
Never imply that the source contradicts or supersedes the textbook.
Every thought unit must position itself as additional perspective, not primary truth.

TARGET: Extract 5–15 thought units. Fewer is better than including low-value filler.

OUTPUT: Valid JSON only — no markdown fences, no explanation outside the JSON.
Schema:
{
  "thoughtUnits": [
    {
      "text": "verbatim or near-verbatim passage from the source",
      "anchorType": "coreIdea | mechanism | application | trap | definition | keyDetail | memoryAnchor | formula",
      "reason": "≤10 words",
      "conceptTitle": "textbook concept this reinforces",
      "grounding": "one sentence"
    }
  ]
}`;

// ── User message builder (all user-controlled data lives here) ────────────────
function buildUserMessage(
  sourceLabel: string,
  conceptTitles: string[],
  sourceText: string,
): string {
  const conceptList = conceptTitles.length > 0
    ? conceptTitles.slice(0, 30).map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "(No concept list provided — use 'General' for conceptTitle)";

  return [
    `SOURCE TYPE: ${sourceLabel}`,
    "",
    "=== TEXTBOOK CONCEPTS (ground thought units against these) ===",
    conceptList,
    "",
    "=== SOURCE MATERIAL ===",
    sourceText.slice(0, 6000).trim(),
    "",
    "Extract thought units from the source material above. Return only the JSON object.",
  ].join("\n");
}

// ── Fallback when API unavailable ────────────────────────────────────────────
function buildFallback(): ExtractedThoughtUnitRaw[] {
  return [];
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "POST") {
    res.status(405).json({ thoughtUnits: [], provider: "fallback", error: "Method not allowed" });
    return;
  }

  const { sourceText, sourceLabel, conceptTitles } = req.body as RequestBody;

  if (!sourceText?.trim()) {
    res.status(400).json({ thoughtUnits: [], provider: "fallback", error: "sourceText is required" });
    return;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    DEV && console.error("[LEARNING_SOURCE_EXTRACT] OPENAI_API_KEY not set");
    res.status(200).json({ thoughtUnits: buildFallback(), provider: "fallback", error: "API key not configured" });
    return;
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 50_000);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      signal: ctrl.signal,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.15,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user",   content: buildUserMessage(sourceLabel ?? "External Resource", Array.isArray(conceptTitles) ? conceptTitles : [], sourceText) },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      DEV && console.error("[LEARNING_SOURCE_EXTRACT] OpenAI error:", resp.status, errText.slice(0, 200));
      res.status(200).json({ thoughtUnits: buildFallback(), provider: "fallback", error: `OpenAI ${resp.status}` });
      return;
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";

    let parsed: { thoughtUnits?: unknown[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      DEV && console.error("[LEARNING_SOURCE_EXTRACT] JSON parse failed:", raw.slice(0, 200));
      res.status(200).json({ thoughtUnits: buildFallback(), provider: "fallback", error: "JSON parse failed" });
      return;
    }

    const VALID_ANCHOR_TYPES = new Set([
      "coreIdea", "mechanism", "application", "trap",
      "definition", "keyDetail", "memoryAnchor", "formula",
    ]);

    const units: ExtractedThoughtUnitRaw[] = (Array.isArray(parsed.thoughtUnits) ? parsed.thoughtUnits : [])
      .filter((u): u is Record<string, unknown> => u !== null && typeof u === "object")
      .map((u) => ({
        text:         String(u.text         ?? "").trim(),
        anchorType:   VALID_ANCHOR_TYPES.has(String(u.anchorType)) ? String(u.anchorType) : "keyDetail",
        reason:       String(u.reason       ?? "").slice(0, 80),
        conceptTitle: String(u.conceptTitle ?? "General").trim(),
        grounding:    String(u.grounding    ?? "").trim(),
      }))
      .filter(u => u.text.length > 10)
      .slice(0, 20);

    DEV && console.log("[LEARNING_SOURCE_EXTRACT_SUCCESS]", { count: units.length, sourceLabel });

    res.status(200).json({ thoughtUnits: units, provider: "openai" });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    DEV && console.error("[LEARNING_SOURCE_EXTRACT] error:", msg);
    res.status(200).json({ thoughtUnits: buildFallback(), provider: "fallback", error: msg });
  }
}
