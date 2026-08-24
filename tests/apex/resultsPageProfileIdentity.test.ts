// tests/apex/resultsPageProfileIdentity.test.ts
// P0 fix — app/apex/results/page.tsx used to score, persist, and analyze
// every attempt as if it were DAT: DAT_SECTIONS.map(...) for the section
// breakdown, and DAT_EXAM_PROFILE_ID/DAT_EXAM_PROFILE hardcoded into
// buildEngineAttempts/buildWeaknessReport/buildStudyRecommendation. A Custom
// Exam attempt's questions carry sectionId "general", which never matches
// any of the 4 DAT_SECTIONS entries, so the section-score table came back
// silently empty and the weakness report was thresholded using DAT's own
// numbers regardless of which profile actually generated the exam.
//
// No jsdom/render harness for this file in this repo — source inspection,
// matching this repo's established pattern for React page components.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/results/page.tsx"), "utf8");
const TYPES_SRC = fs.readFileSync(path.resolve(__dirname, "../../types/apex-exam.ts"), "utf8");
const ADAPTER_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/examEngine/legacyAdapter.ts"), "utf8");

describe("types/apex-exam.ts — DATQuestion carries which profile generated it", () => {
  it("REQUIRED: DATQuestion.examProfileId exists", () => {
    expect(TYPES_SRC).toMatch(/examProfileId\?: string;/);
  });
});

describe("lib/examEngine/legacyAdapter.ts — examProfileId survives EngineQuestion -> DATQuestion", () => {
  it("REQUIRED: engineQuestionToDATQuestion carries q.examProfileId through", () => {
    const idx = ADAPTER_SRC.indexOf("export function engineQuestionToDATQuestion");
    expect(idx).toBeGreaterThan(-1);
    const block = ADAPTER_SRC.slice(idx, idx + 1200);
    expect(block).toMatch(/examProfileId: q\.examProfileId,/);
  });
});

describe("app/apex/results/page.tsx — resolves the real generating profile instead of assuming DAT", () => {
  it("REQUIRED: imports CUSTOM_EXAM_PROFILE and defines a resolveExamProfile helper", () => {
    expect(SRC).toMatch(/import \{ CUSTOM_EXAM_PROFILE, CUSTOM_EXAM_PROFILE_ID \} from '@\/lib\/examEngine\/profiles\/customProfile';/);
    expect(SRC).toMatch(/function resolveExamProfile\(examProfileId: string \| undefined\): ExamProfile \{/);
  });

  it("REQUIRED: buildEngineAttempts uses the question's own examProfileId, not a hardcoded constant", () => {
    const idx = SRC.indexOf("function buildEngineAttempts");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/examProfileId: q\.examProfileId \?\? DAT_EXAM_PROFILE_ID,/);
  });

  it("REQUIRED: section-score computation resolves the active profile's own sections instead of always DAT_SECTIONS", () => {
    const idx = SRC.indexOf("const totalScore = correctAnswers;");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 900);
    expect(block).toMatch(/const examProfileId = exam\.questions\.find\(q => q\.examProfileId\)\?\.examProfileId \?\? DAT_EXAM_PROFILE_ID;/);
    expect(block).toMatch(/const activeProfile = resolveExamProfile\(examProfileId\);/);
    expect(block).toMatch(/const profileSections = activeProfile\.id === DAT_EXAM_PROFILE_ID \? DAT_SECTIONS : activeProfile\.sections;/);
    expect(block).toMatch(/const sectionScores = profileSections\.map\(section => \{/);
    expect(block).not.toMatch(/const sectionScores = DAT_SECTIONS\.map\(section => \{/);
  });

  it("REQUIRED: the resolved examProfileId is persisted on the results object, not dropped", () => {
    const idx = SRC.indexOf("setResults({");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 200);
    expect(block).toMatch(/examProfileId,/);
  });

  it("REQUIRED: the weakness-report/recommendation effect uses the attempt's own resolved profile, not the DAT constants directly", () => {
    const idx = SRC.indexOf("const bookId = results.exam.questions.find((q) => q.sourceBookId)?.sourceBookId;");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 1600);
    expect(block).toMatch(/const activeProfile = resolveExamProfile\(results\.examProfileId\);/);
    expect(block).toMatch(/buildWeaknessReport\(bookId, activeProfile\.id, attempts, activeProfile\.weaknessAnalytics\)/);
    expect(block).toMatch(/buildStudyRecommendation\(report, activeProfile, bookId, wrongAnswers\)/);
    expect(block).not.toMatch(/buildWeaknessReport\(bookId, DAT_EXAM_PROFILE_ID, attempts, DAT_EXAM_PROFILE\.weaknessAnalytics\)/);
    expect(block).not.toMatch(/buildStudyRecommendation\(report, DAT_EXAM_PROFILE, bookId\)/);
  });
});
