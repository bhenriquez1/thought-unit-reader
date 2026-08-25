// tests/apex/c6CourseExamWiring.test.ts
// C6 (Phase 0 audit) — closes the gap the Phase 0 audit found: "Course Exam
// types (Chapter Quiz/Unit Exam/Midterm/Cumulative Final)" was explicitly
// named as a C6 deliverable and didn't exist anywhere — course-exam was an
// `available: false` catalog placeholder with zero implementation. This
// locks in that Course Exam is now a real, selectable fourth profile, and
// that its four types render as a real picker gated to only when Course
// Exam is the active profile.
//
// No jsdom/render harness for these App Router pages in this repo — source
// inspection, matching this repo's established pattern for React components.

import fs from "fs";
import path from "path";

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf8");
}

describe("lib/examEngine/profiles/profileCatalog.ts — course-exam is real, not a placeholder", () => {
  it("REQUIRED: course-exam entry is available", () => {
    const { EXAM_PROFILE_CATALOG } = require("@/lib/examEngine/profiles/profileCatalog");
    const entry = EXAM_PROFILE_CATALOG.find((p: { id: string }) => p.id === "course-exam");
    expect(entry).toBeDefined();
    expect(entry.available).toBe(true);
  });
});

describe("lib/examEngine/profiles/profileRegistry.ts — resolves course-exam to the real profile", () => {
  it("REQUIRED: resolveProfileById('course-exam') returns COURSE_EXAM_PROFILE", () => {
    const { resolveProfileById } = require("@/lib/examEngine/profiles/profileRegistry");
    const { COURSE_EXAM_PROFILE } = require("@/lib/examEngine/profiles/courseExamProfile");
    expect(resolveProfileById("course-exam")).toBe(COURSE_EXAM_PROFILE);
  });
});

describe("app/apex/generator/page.tsx — Course Exam is a real, clickable Exam Type button with a type picker", () => {
  const SRC = read("app/apex/generator/page.tsx");

  it("REQUIRED: imports COURSE_EXAM_PROFILE_ID and COURSE_EXAM_TYPES", () => {
    expect(SRC).toMatch(/import \{ COURSE_EXAM_PROFILE_ID \} from '@\/lib\/examEngine\/profiles\/courseExamProfile';/);
    expect(SRC).toMatch(/import \{ COURSE_EXAM_TYPES \} from '@\/lib\/examEngine\/courseExamTypes';/);
  });

  it("REQUIRED: has a real onClick handler selecting the course-exam profile", () => {
    expect(SRC).toMatch(/onClick=\{\(\) => handleProfileChange\(COURSE_EXAM_PROFILE_ID\)\}/);
  });

  it("REQUIRED: the DAT, Custom, and Board/Licensure buttons from the prior picker still exist unchanged", () => {
    expect(SRC).toMatch(/onClick=\{\(\) => handleProfileChange\('dat'\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => handleProfileChange\(CUSTOM_EXAM_PROFILE_ID\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => handleProfileChange\(BOARD_LICENSURE_EXAM_PROFILE_ID\)\}/);
  });

  it("REQUIRED: the Course Exam Type picker is gated behind examProfileId === COURSE_EXAM_PROFILE_ID", () => {
    expect(SRC).toMatch(/\{examProfileId === COURSE_EXAM_PROFILE_ID && \(/);
  });

  it("REQUIRED: the type picker maps over COURSE_EXAM_TYPES and calls handleCourseExamTypeSelect", () => {
    expect(SRC).toMatch(/\{COURSE_EXAM_TYPES\.map\(\(type\) => \(/);
    expect(SRC).toMatch(/onClick=\{\(\) => handleCourseExamTypeSelect\(type\.id\)\}/);
  });

  it("REQUIRED: handleCourseExamTypeSelect sets scope, practiceMode, and questionCount from the type config, then clears any stale generated exam", () => {
    const idx = SRC.indexOf("function handleCourseExamTypeSelect(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 500);
    expect(block).toMatch(/setExamScope\(cfg\.scope\);/);
    expect(block).toMatch(/setPracticeMode\(cfg\.practiceMode\);/);
    expect(block).toMatch(/setQuestionCount\(cfg\.questionCount\);/);
    expect(block).toMatch(/setGeneratedExam\(null\);/);
    expect(block).toMatch(/setGenerationError\(null\);/);
  });

  it("switching exam profile resets the selected course exam type, so a stale type selection can't survive a profile switch", () => {
    const idx = SRC.indexOf("function handleProfileChange(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 200);
    expect(block).toMatch(/setCourseExamType\(null\);/);
  });
});
