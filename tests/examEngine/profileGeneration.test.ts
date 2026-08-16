// tests/examEngine/profileGeneration.test.ts
// X1 — app/apex/page.tsx (the Exam Forge dashboard) no longer imports the
// legacy ExamGenerator class directly; it goes through
// lib/examEngine/profileGeneration.ts. The wrapper's own behavior is
// intentionally IDENTICAL to before (ExamGenerator.fromQuestionBank() does
// a browser fetch("/questions.json"), so it can't run in this repo's Node
// test env — same reasoning as every other fetch-touching module here).
// Static-analysis proves the wrapper delegates rather than reimplementing.

import fs from "fs";
import path from "path";

const WRAPPER_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/examEngine/profileGeneration.ts"), "utf8");
const PAGE_SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/page.tsx"), "utf8");

describe("lib/examEngine/profileGeneration.ts", () => {
  it("REQUIRED: delegates to the existing ExamGenerator/examGeneratorUtils rather than reimplementing generation logic", () => {
    expect(WRAPPER_SRC).toMatch(/import \{ ExamGenerator, examGeneratorUtils, type GeneratedExam, type GeneratorOptions \} from "@\/lib\/apex\/examGenerator";/);
    expect(WRAPPER_SRC).toMatch(/await ExamGenerator\.fromQuestionBank\(\)/);
    expect(WRAPPER_SRC).toMatch(/examGeneratorUtils\.createWeakTopicsPractice\(/);
    expect(WRAPPER_SRC).toMatch(/examGeneratorUtils\.createFullDAT\(\)/);
  });

  it("exports generateWeakTopicsPracticeExam and generateFullSimulationExam", () => {
    expect(WRAPPER_SRC).toMatch(/export async function generateWeakTopicsPracticeExam\(/);
    expect(WRAPPER_SRC).toMatch(/export async function generateFullSimulationExam\(\)/);
  });
});

describe("app/apex/page.tsx — dashboard decoupled from the legacy ExamGenerator class (X1)", () => {
  it("REQUIRED: no longer imports ExamGenerator/examGeneratorUtils directly", () => {
    expect(PAGE_SRC).not.toMatch(/import \{ ExamGenerator, examGeneratorUtils \} from "@\/lib\/apex\/examGenerator";/);
  });

  it("REQUIRED: imports the profileGeneration wrapper instead", () => {
    expect(PAGE_SRC).toMatch(/import \{ generateWeakTopicsPracticeExam, generateFullSimulationExam \} from "@\/lib\/examEngine\/profileGeneration";/);
  });

  it("handleStartRecommended calls generateWeakTopicsPracticeExam with the same inputs as before (patterns, targetPatterns, count, difficulty)", () => {
    const idx = PAGE_SRC.indexOf("const handleStartRecommended");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 600);
    expect(block).toMatch(/generateWeakTopicsPracticeExam\(\s*patterns,\s*currentRecommendation\.targetPatterns,\s*20,\s*adaptiveDifficulty,\s*\)/);
  });

  it("handleStartSimulation calls generateFullSimulationExam", () => {
    const idx = PAGE_SRC.indexOf("const handleStartSimulation");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 400);
    expect(block).toMatch(/generateFullSimulationExam\(\)/);
  });
});
