// tests/examEngine/profileGeneration.test.ts
// Product-split Phase 1, item 1 — app/apex/page.tsx's "Start Now" (Today
// tab) and "Start Practice Simulation"/"Prometric Mode" (Full-Length Exams
// tab) buttons no longer generate from the legacy static question bank
// (public/questions.json via lib/apex/examGenerator.ts). They now go
// through lib/examEngine/examBuilder.ts's book-grounded, AI-generated,
// server-verified path — the same one app/apex/generator/page.tsx already
// used — and are gated behind having at least one book with Reader notes.

import fs from "fs";
import path from "path";

const WRAPPER_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/examEngine/profileGeneration.ts"), "utf8");
const PAGE_SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/page.tsx"), "utf8");

describe("lib/examEngine/profileGeneration.ts — book-grounded generation (product split, Phase 1 item 1)", () => {
  it("REQUIRED: delegates to buildExam/builtExamToGeneratedExam, never the legacy static-bank ExamGenerator", () => {
    expect(WRAPPER_SRC).toMatch(/import \{ buildExam \} from "@\/lib\/examEngine\/examBuilder";/);
    expect(WRAPPER_SRC).toMatch(/import \{ builtExamToGeneratedExam, legacyToDifficulty \} from "@\/lib\/examEngine\/legacyAdapter";/);
    // GeneratedExam is still imported as a TYPE (the output shape proctor/
    // results already render) — only the generator class/utils are gone.
    expect(WRAPPER_SRC).toMatch(/import type \{ GeneratedExam \} from "@\/lib\/apex\/examGenerator";/);
    expect(WRAPPER_SRC).not.toMatch(/import \{ ExamGenerator/);
    expect(WRAPPER_SRC).not.toMatch(/ExamGenerator\.fromQuestionBank/);
    expect(WRAPPER_SRC).not.toMatch(/examGeneratorUtils/);
  });

  it("REQUIRED: both exports require a bookId — no path generates without one", () => {
    expect(WRAPPER_SRC).toMatch(/export async function generateWeakTopicsPracticeExam\(\s*bookId: string,/);
    expect(WRAPPER_SRC).toMatch(/export async function generateFullSimulationExam\(\s*bookId: string,\s*bookTitle: string \| undefined,\s*profile: ExamProfile,\s*\)/);
  });

  it("narrows weak-topics practice to the DAT sections implicated by the target patterns, not a fabricated chapter mapping", () => {
    expect(WRAPPER_SRC).toMatch(/APEX_SECTION_TO_PROFILE_SECTION/);
    expect(WRAPPER_SRC).toMatch(/sectionIds: targetSections\.size > 0 \? Array\.from\(targetSections\) : undefined,/);
  });

  it("maps the legacy AdaptiveDifficulty vocabulary ('mixed' included) onto DifficultyLevel rather than assuming they're the same type", () => {
    expect(WRAPPER_SRC).toMatch(/difficulty === "mixed" \? "simulation" : legacyToDifficulty\(difficulty\)/);
  });

  it("REQUIRED: rejects an empty build (zero questions) instead of returning a launchable exam with no questions — buildExam can legitimately resolve empty when the targeted sections have no notes yet", () => {
    const weakIdx = WRAPPER_SRC.indexOf("export async function generateWeakTopicsPracticeExam(");
    const fullIdx = WRAPPER_SRC.indexOf("export async function generateFullSimulationExam(");
    expect(weakIdx).toBeGreaterThan(-1);
    expect(fullIdx).toBeGreaterThan(weakIdx);
    const weakBlock = WRAPPER_SRC.slice(weakIdx, fullIdx);
    const fullBlock = WRAPPER_SRC.slice(fullIdx);
    expect(weakBlock).toMatch(/if \(built\.questions\.length === 0\) \{\s*throw new Error\(/);
    expect(fullBlock).toMatch(/if \(built\.questions\.length === 0\) \{\s*throw new Error\(/);
  });
});

describe("app/apex/page.tsx — Today/Full-Length Exams tabs require a book before generating (product split, Phase 1 item 1)", () => {
  it("REQUIRED: loads the user's book catalogue via getUserBookCatalogue, the same source app/apex/generator/page.tsx uses", () => {
    expect(PAGE_SRC).toMatch(/import \{ getUserBookCatalogue \} from "@\/lib\/apex\/bookCatalogue";/);
    expect(PAGE_SRC).toMatch(/function usePrimaryApexBook\(\)/);
  });

  it("REQUIRED: handleStartRecommended bails out and the Start Now button is disabled with no eligible book", () => {
    const idx = PAGE_SRC.indexOf("const handleStartRecommended");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 700);
    expect(block).toMatch(/if \(!currentRecommendation \|\| !primaryBook \|\| !isDatActive\) return;/);
    expect(block).toMatch(/generateWeakTopicsPracticeExam\(\s*primaryBook\.bookId,\s*primaryBook\.bookTitle,/);
    const buttonIdx = PAGE_SRC.indexOf("onClick={handleStartRecommended}");
    expect(buttonIdx).toBeGreaterThan(-1);
    const buttonBlock = PAGE_SRC.slice(buttonIdx, buttonIdx + 200);
    expect(buttonBlock).toMatch(/disabled=\{launching \|\| !primaryBook \|\| !isDatActive\}/);
  });

  it("REQUIRED: handleStartSimulation bails out and both simulation buttons are disabled with no eligible book", () => {
    const idx = PAGE_SRC.indexOf("const handleStartSimulation");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 700);
    expect(block).toMatch(/if \(!primaryBook\) return;/);
    expect(block).toMatch(/generateFullSimulationExam\(primaryBook\.bookId, primaryBook\.bookTitle, resolveExamProfile\(activeProfileId\)\)/);
    const occurrences = (PAGE_SRC.match(/disabled=\{seeding \|\| !primaryBook\}/g) ?? []).length;
    expect(occurrences).toBe(2); // Start Practice Simulation + Prometric Mode
  });

  it("shows an empty-state message pointing back to the Reader, matching the existing generator page's wording, instead of a silently-disabled button with no explanation", () => {
    const occurrences = (PAGE_SRC.match(/No book with notes yet/g) ?? []).length;
    expect(occurrences).toBe(2); // TodayTab + FullExamsTab
  });

  it("REQUIRED: Start Now surfaces a launch error to the user (e.g. an empty-build rejection from profileGeneration.ts) instead of just silently re-enabling the button", () => {
    const idx = PAGE_SRC.indexOf("const handleStartRecommended");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 900);
    expect(block).toMatch(/setLaunchError\(err instanceof Error \? err\.message : "Could not prepare the exam\. Please try again\."\);/);
    expect(PAGE_SRC).toMatch(/\{launchError && \(/);
  });

  it("REQUIRED: FullExamsTab no longer badges the panel 'Official Format' — generateFullSimulationExam sources one book only (usePrimaryApexBook picks the single book with the most notes), buildExam neither combines multiple subject books nor fills every blueprint section's quota, so labeling it an official-format simulation was misleading", () => {
    const idx = PAGE_SRC.indexOf("{/* Full simulation panel */}");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 1200);
    expect(block).not.toMatch(/Official Format/);
    expect(block).toMatch(/DAT Blueprint/);
  });

  it("REQUIRED: names the single source book and warns that section coverage may be thin/defaulted, instead of implying full official coverage", () => {
    const idx = PAGE_SRC.indexOf("{/* Full simulation panel */}");
    const block = PAGE_SRC.slice(idx, idx + 1700);
    expect(block).toMatch(/Questions are generated from \{primaryBook \? <span className="text-gray-300 font-medium">\{primaryBook\.bookTitle\}<\/span> : "your primary book"\} only/);
    expect(block).toMatch(/default to Survey of Natural Sciences/);
  });
});
