// lib/insights/buildMiniTestQuestions.ts
// Generates 5 role-grounded Mini Test questions for ANY book genre.
// One question per role — no semantic duplicates, no copying panel text.
//
// Roles:
//   coreMeaning  — tests the page's central idea (What is X?)
//   mechanism    — tests causal/process understanding (Why/How does X work?)
//   contrast     — tests boundary/trap awareness (How does X differ from Y?)
//   application  — tests operational rule recall (When/what must you do about X?)
//   skimTrap     — tests skimming danger (What do readers often mistake about X?)

import type { ConceptBlockInput } from "./extractConceptBlocks";
import { isTooSimilar } from "./dedupeSectionCandidates";

export type MiniTestRole =
  | "coreMeaning"
  | "mechanism"
  | "contrast"
  | "application"
  | "skimTrap";

export interface MiniTestQuestion {
  role: MiniTestRole;
  question: string;
}

export interface BuildMiniTestResult {
  questions: MiniTestQuestion[];
}

// ---------------------------------------------------------------------------
// Template banks — generic enough to work for any subject matter
// ---------------------------------------------------------------------------

function coreMeaningQ(title: string): string {
  const t = title.toLowerCase();
  return `What is the core meaning of ${t}, and why does this page treat it as central?`;
}

function mechanismQ(title: string, reasonSentence?: string): string {
  const t = title.toLowerCase();
  if (reasonSentence) {
    // Extract a short anchor phrase from the reason sentence to make it specific
    const phrase = reasonSentence.replace(/\b(because|therefore|thus|results? in|leads? to|allows?)\b.*/i, "").trim();
    const anchor = phrase.slice(0, 60).replace(/[,;:]+$/, "").trim();
    if (anchor.length >= 8) {
      return `Why does "${anchor}" matter — what is the underlying mechanism?`;
    }
  }
  return `How does ${t} work, and what mechanism drives it?`;
}

function contrastQ(title: string, trapSentence?: string): string {
  const t = title.toLowerCase();
  if (trapSentence) {
    // Pick the first contrast marker to surface the actual distinction
    const match = trapSentence.match(
      /\b(however|whereas|unlike|in contrast|rather than|not |different from|distinct from)\b.{5,60}/i
    );
    if (match) {
      const snippet = match[0].slice(0, 55).replace(/[,;:]+$/, "").trim();
      return `The page notes "${snippet}" — what exactly is the distinction being drawn?`;
    }
  }
  return `How is ${t} different from the concepts that surround it on this page?`;
}

function applicationQ(title: string, ruleSentence?: string): string {
  const t = title.toLowerCase();
  if (ruleSentence) {
    const match = ruleSentence.match(
      /\b(must|should|always|never|requires?|ensures?|prevents?|critical|remember)\b.{5,80}/i
    );
    if (match) {
      const snippet = match[0].slice(0, 60).replace(/[,;:]+$/, "").trim();
      return `The rule "${snippet}" — in what situation does this apply?`;
    }
  }
  return `What is the key operational rule for ${t}, and when does it apply?`;
}

function skimTrapQ(title: string, trapSentence?: string): string {
  const t = title.toLowerCase();
  if (trapSentence) {
    return `What do readers commonly misunderstand about ${t}? (Hint: the page flags a trap here.)`;
  }
  return `What is the easiest mistake to make when skimming the section on ${t}?`;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildMiniTestQuestions(
  concepts: ConceptBlockInput[]
): BuildMiniTestResult {
  if (!concepts.length) return { questions: [] };

  const questions: MiniTestQuestion[] = [];
  const usedTexts: string[] = [];

  // Each role uses a different concept block as its grounding source
  // to maximize coverage of the page's ideas.
  const roleOrder: MiniTestRole[] = [
    "coreMeaning",
    "mechanism",
    "contrast",
    "application",
    "skimTrap",
  ];

  // Map roles to concept blocks by rotating through available blocks
  const conceptForRole = (roleIndex: number): ConceptBlockInput =>
    concepts[roleIndex % concepts.length];

  for (let i = 0; i < roleOrder.length; i++) {
    const role = roleOrder[i];
    const c = conceptForRole(i);
    const title = c.title;

    let q: string;
    switch (role) {
      case "coreMeaning":
        q = coreMeaningQ(title);
        break;
      case "mechanism": {
        // Prefer a support sentence with a causal signal
        const reasonSentence = c.supportSentences.find(
          (s) => /\b(because|therefore|thus|results? in|leads? to|allows?|explains?|causes?|enables?|drives?)\b/i.test(s)
        );
        q = mechanismQ(title, reasonSentence);
        break;
      }
      case "contrast": {
        const trapSentence = c.trapCandidates[0] ?? c.supportSentences.find(
          (s) => /\b(however|but|whereas|unlike|in contrast|rather than|not |different from)\b/i.test(s)
        );
        q = contrastQ(title, trapSentence);
        break;
      }
      case "application": {
        const ruleSentence = c.supportSentences.find(
          (s) => /\b(must|should|always|never|requires?|ensures?|prevents?|critical|remember)\b/i.test(s)
        );
        q = applicationQ(title, ruleSentence);
        break;
      }
      case "skimTrap":
        q = skimTrapQ(title, c.trapCandidates[0]);
        break;
    }

    // Dedup check: reject if too similar to an already-added question
    if (isTooSimilar(q, usedTexts, 0.40)) {
      // Try next concept block as fallback source
      const fallback = concepts[(i + 1) % concepts.length];
      if (fallback && fallback.title !== c.title) {
        const qAlt = coreMeaningQ(fallback.title);
        if (!isTooSimilar(qAlt, usedTexts, 0.40)) {
          questions.push({ role, question: qAlt });
          usedTexts.push(qAlt);
        }
      }
      continue;
    }

    questions.push({ role, question: q });
    usedTexts.push(q);
  }

  return { questions };
}
