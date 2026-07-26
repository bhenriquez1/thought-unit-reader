const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import type { CoreExpandRequest, CoreExpandResponse } from "@/lib/coreConceptSchema";

/**
 * POST /api/core/expand
 *
 * Lazy-load expansions for a Core concept card.
 * Only called when user expands a card — keeps initial extraction fast.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body as CoreExpandRequest;

    if (!body.conceptId || !body.windowText) {
      return res.status(400).json({ error: "Missing conceptId or windowText" });
    }

    // Extract procedure steps, examples, and pitfalls from the window text
    const text = body.windowText;
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    const procedure: string[] = [];
    const examples: string[] = [];
    const pitfalls: string[] = [];

    for (const s of sentences) {
      if (/\bstep\b|\bfirst\b|\bthen\b|\bnext\b|\bfinally\b|\bprocedure\b/i.test(s)) {
        if (procedure.length < 3) procedure.push(s.slice(0, 200));
      }
      if (/\bexample\b|\be\.g\.\b|\bfor instance\b|\bsuch as\b/i.test(s)) {
        if (examples.length < 2) examples.push(s.slice(0, 200));
      }
      if (/\btrap\b|\bmistake\b|\bavoid\b|\bdon't\b|\bcareful\b|\bexcept\b|\bpitfall\b/i.test(s)) {
        if (pitfalls.length < 2) pitfalls.push(s.slice(0, 200));
      }
    }

    // Auto-generate flashcards (max 2)
    const flashcards: { q: string; a: string }[] = [];
    if (body.conceptLabel) {
      flashcards.push({
        q: `What is ${body.conceptLabel}?`,
        a: sentences[0]?.slice(0, 200) || body.conceptLabel,
      });
    }
    if (pitfalls.length > 0) {
      flashcards.push({
        q: `What is a common pitfall with ${body.conceptLabel}?`,
        a: pitfalls[0],
      });
    }

    const response: CoreExpandResponse = {
      conceptId: body.conceptId,
      expansions: {
        ...(procedure.length > 0 && { procedure }),
        ...(examples.length > 0 && { examples }),
        ...(pitfalls.length > 0 && { pitfalls }),
      },
      flashcards: flashcards.slice(0, 2),
    };

    return res.status(200).json(response);
  } catch (error) {
    DEV && console.error("Core expand error:", error);
    return res.status(500).json({
      error: "EXPAND_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
