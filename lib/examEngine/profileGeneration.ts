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
import type { ExamProfile } from "@/lib/examEngine/types";

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
  // buildExam can legitimately resolve with zero questions (no notes in the
  // targeted sections yet, or every /api/exam-question-gen call failed) —
  // app/apex/generator/page.tsx's own generateExam() already guards this
  // exact case before launching; this quick-launch path (Today tab's "Start
  // Now") skipped it, so an empty build reached the proctor as "Question Not
  // Found" instead of a clear failure here.
  if (built.questions.length === 0) {
    throw new Error("No questions could be generated for these weak topics yet — read and synthesize a few more pages first.");
  }
  return builtExamToGeneratedExam(built, Math.round(questionCount * 1.5), "practice", DAT_EXAM_PROFILE);
}

// P0 fix: this used to hardcode DAT_EXAM_PROFILE into buildExam() regardless
// of which profile app/apex/page.tsx's ExamProfileSwitcher showed as active,
// so picking Custom Exam and clicking "Start Practice Simulation" silently
// generated a DAT exam anyway. buildExam() itself is already profile-generic
// (see examBuilder.ts), so the fix is just to stop overriding the caller's
// choice with a constant. Timing falls back to the profile's own
// timingRules when it isn't DAT's blueprint-timed ACTIVE_DAT_BLUEPRINT,
// since that blueprint's per-section timing is DAT-specific.
export async function generateFullSimulationExam(
  bookId: string,
  bookTitle: string | undefined,
  profile: ExamProfile,
): Promise<GeneratedExam> {
  // P1 fix — this was hardcoded to 280 (matching DAT's real section
  // question counts, PRACTICE_MODES' "full-dat" defaultQuestions) for
  // EVERY profile, including Custom Exam, whose sole "general" section
  // declares only 20 questions and has no full-DAT blueprint. For a book
  // with enough notes that generated hundreds of AI questions for what's
  // supposed to be a 60-minute custom exam; for a thinner book, the API's
  // per-concept question cap instead produced an unpredictably undersized
  // exam. Deriving it from the profile's own sections is correct for both
  // cases — for DAT it sums to exactly 280 (100+90+50+40, unchanged), and
  // for Custom Exam it correctly comes out to 20.
  const questionCount = profile.sections.reduce((sum, s) => sum + s.defaultQuestionCount, 0);
  const built = await buildExam({
    bookId,
    bookTitle,
    profile,
    difficulty: "simulation",
    questionCount,
  });
  // See generateWeakTopicsPracticeExam's identical guard above — an empty
  // build must never reach the proctor as a launchable "full simulation."
  if (built.questions.length === 0) {
    throw new Error("No questions could be generated for a full simulation yet — read and synthesize more of this book first.");
  }
  const timeLimitMinutes = profile.id === DAT_EXAM_PROFILE.id
    ? totalTestingMinutes(ACTIVE_DAT_BLUEPRINT)
    : profile.timingRules.totalTimeLimitMinutes;
  return builtExamToGeneratedExam(built, timeLimitMinutes, "full-dat", profile);
}
