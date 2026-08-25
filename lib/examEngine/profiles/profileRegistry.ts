// lib/examEngine/profiles/profileRegistry.ts
// C5 (Phase 0 audit) — before this file, "examProfileId string -> ExamProfile
// object" was hand-duplicated as a DAT/Custom-only ternary independently in
// three places (app/apex/page.tsx, app/apex/generator/page.tsx,
// app/apex/results/page.tsx). Adding a third real profile (Board/Licensure)
// meant either updating all three duplicates in lockstep or fixing the
// duplication itself; this is the single source of truth all three now
// delegate to. Each call site keeps its own existing function name/signature
// (some are already covered by regression tests pinning that exact
// declaration) — only the body changes to call this.
import type { ExamProfile } from "@/lib/examEngine/types";
import { DAT_EXAM_PROFILE, DAT_EXAM_PROFILE_ID } from "./datProfile";
import { CUSTOM_EXAM_PROFILE, CUSTOM_EXAM_PROFILE_ID } from "./customProfile";
import { BOARD_LICENSURE_EXAM_PROFILE, BOARD_LICENSURE_EXAM_PROFILE_ID } from "./boardLicensureProfile";
import { COURSE_EXAM_PROFILE, COURSE_EXAM_PROFILE_ID } from "./courseExamProfile";

const PROFILES_BY_ID: Record<string, ExamProfile> = {
  [DAT_EXAM_PROFILE_ID]: DAT_EXAM_PROFILE,
  [CUSTOM_EXAM_PROFILE_ID]: CUSTOM_EXAM_PROFILE,
  [BOARD_LICENSURE_EXAM_PROFILE_ID]: BOARD_LICENSURE_EXAM_PROFILE,
  [COURSE_EXAM_PROFILE_ID]: COURSE_EXAM_PROFILE,
};

/** Unknown/undefined ids (including legacy pre-profile-field attempts) fall
 *  back to DAT — the same fallback every one of the three call sites this
 *  replaces already used. */
export function resolveProfileById(id: string | undefined): ExamProfile {
  return (id && PROFILES_BY_ID[id]) || DAT_EXAM_PROFILE;
}
