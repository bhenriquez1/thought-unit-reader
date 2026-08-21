// lib/examEngine/profileGeneration.ts
// Seam between the TestLab dashboard and its question source.
//
// Product-split Phase 1, item 1: this wrapper used to delegate to the legacy
// static question bank (lib/apex/examGenerator.ts, public/questions.json) —
// zero relationship to anything the student has actually read. It now
// sources exclusively from the student's own uploaded book via
// lib/examEngine/examBuilder.ts (AI-generated, server-verified grounded
// against the book's own notes/canonical units — see
// pages/api/exam-question-gen.ts's provenance gate), the same path
// app/apex/generator/page.tsx already proved out. The dashboard callers
// (app/apex/page.tsx) are responsible for having a bookId to pass in —
// see getUserBookCatalogue() in lib/apex/bookCatalogue.ts and the "no book
// yet" empty state gating both buttons before they ever call this file.

import { buildExam } from "@/lib/examEngine/examBuilder";
import { builtExamToGeneratedExam, legacyToDifficulty } from "@/lib/examEngine/legacyAdapter";
import { DAT_EXAM_PROFILE } from "@/lib/examEngine/profiles/datProfile";
import { ACTIVE_DAT_BLUEPRINT } from "@/lib/datApex/activeBlueprint";
import { totalTestingMinutes } from "@/lib/datApex/blueprint";
import type { GeneratedExam } from "@/lib/apex/examGenerator";
import type { UserPattern } from "@/lib/apex/datApexTypes";
import type { AdaptiveDifficulty } from "@/lib/stores/apexEngineStore";

/** UserPattern.section (bio/gc/orgo/pat/rc/qr) -> DAT_EXAM_PROFILE section id.
 *  Biology/Gen Chem/Organic Chem are three sub-parts of DAT's one Natural
 *  Sciences section, so several ApexSections collapse onto the same profile
 *  section — narrowing "weak topics" to a profile section is coarser than
 *  the legacy generator's per-pattern targeting, but it's an honest section-
 *  level narrowing rather than a fabricated chapter-level one; per-topic
 *  weak-area targeting against the student's own book is real, separate,
 *  and larger follow-on work (lib/examEngine/recommendationEngine.ts is
 *  already profile-aware and is the right place for it later). */
const APEX_SECTION_TO_PROFILE_SECTION: Record<UserPattern["section"], string> = {
  bio: "survey-natural-sciences",
  gc: "survey-natural-sciences",
  orgo: "survey-natural-sciences",
  pat: "perceptual-ability",
  rc: "reading-comprehension",
  qr: "quantitative-reasoning",
};

export async function generateWeakTopicsPracticeExam(
  bookId: string,
  bookTitle: string | undefined,
  patterns: UserPattern[],
  targetPatternIds: string[],
  questionCount: number,
  difficulty: AdaptiveDifficulty,
): Promise<GeneratedExam> {
  const targetSections = new Set(
    patterns
      .filter((p) => targetPatternIds.includes(p.id))
      .map((p) => APEX_SECTION_TO_PROFILE_SECTION[p.section]),
  );
  const built = await buildExam({
    bookId,
    bookTitle,
    profile: DAT_EXAM_PROFILE,
    // "mixed" has no direct DifficultyLevel counterpart (adaptive difficulty
    // is a legacy pattern-mastery concept, DifficultyLevel a profile-generic
    // one) — "simulation" (real-DAT pacing) is the reasonable default when
    // there isn't enough mastery data yet to pick a lane.
    difficulty: difficulty === "mixed" ? "simulation" : legacyToDifficulty(difficulty),
    questionCount,
    sectionIds: targetSections.size > 0 ? Array.from(targetSections) : undefined,
  });
  return builtExamToGeneratedExam(built, Math.round(questionCount * 1.5), "practice");
}

export async function generateFullSimulationExam(bookId: string, bookTitle?: string): Promise<GeneratedExam> {
  const built = await buildExam({
    bookId,
    bookTitle,
    profile: DAT_EXAM_PROFILE,
    difficulty: "simulation",
    questionCount: 280, // matches PRACTICE_MODES' "full-dat" defaultQuestions
  });
  return builtExamToGeneratedExam(built, totalTestingMinutes(ACTIVE_DAT_BLUEPRINT), "full-dat");
}
