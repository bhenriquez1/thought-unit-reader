// tests/examEngine/profileRegistry.test.ts
// C5 (Phase 0 audit) — before profileRegistry.ts existed, "profile id ->
// ExamProfile object" was a DAT/Custom-only ternary hand-duplicated in
// app/apex/page.tsx, app/apex/generator/page.tsx, and app/apex/results/
// page.tsx. Adding Board/Licensure as a third real profile meant either
// updating all three in lockstep (easy to miss one, silently stranding a
// profile) or fixing the duplication — resolveProfileById is now the single
// source of truth all three delegate to. Real behavioral tests — plain data,
// no IDB/network dependency.

import { resolveProfileById } from "@/lib/examEngine/profiles/profileRegistry";
import { DAT_EXAM_PROFILE, DAT_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/datProfile";
import { CUSTOM_EXAM_PROFILE, CUSTOM_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/customProfile";
import { BOARD_LICENSURE_EXAM_PROFILE, BOARD_LICENSURE_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/boardLicensureProfile";

describe("resolveProfileById", () => {
  it("REQUIRED: resolves each of the three real profile ids to the matching profile object", () => {
    expect(resolveProfileById(DAT_EXAM_PROFILE_ID)).toBe(DAT_EXAM_PROFILE);
    expect(resolveProfileById(CUSTOM_EXAM_PROFILE_ID)).toBe(CUSTOM_EXAM_PROFILE);
    expect(resolveProfileById(BOARD_LICENSURE_EXAM_PROFILE_ID)).toBe(BOARD_LICENSURE_EXAM_PROFILE);
  });

  it("REQUIRED: falls back to DAT for an unknown id — same fallback every call site used before", () => {
    expect(resolveProfileById("some-future-profile-id")).toBe(DAT_EXAM_PROFILE);
  });

  it("REQUIRED: falls back to DAT for undefined — legacy pre-profile-field attempts", () => {
    expect(resolveProfileById(undefined)).toBe(DAT_EXAM_PROFILE);
  });

  it("falls back to DAT for an empty string, never resolving a falsy id to a random profile", () => {
    expect(resolveProfileById("")).toBe(DAT_EXAM_PROFILE);
  });
});
