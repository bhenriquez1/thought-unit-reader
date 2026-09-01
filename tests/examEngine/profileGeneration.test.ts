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

describe("app/apex/page.tsx — canonical builder entry requires a grounded Reader source", () => {
  it("loads the same catalogue as the detailed generator and disables both build actions without a selected book", () => {
    expect(PAGE_SRC).toMatch(/getUserBookCatalogue\(\)/);
    // TestLab source binding fix — selection is keyed by documentId now,
    // never bookId/title.
    expect(PAGE_SRC).toMatch(/setSelectedDocumentId/);
    expect((PAGE_SRC.match(/disabled=\{!selectedBook\}/g) ?? []).length).toBe(2);
  });

  it("routes generation through the detailed source-grounded builder rather than launching a legacy static bank", () => {
    expect(PAGE_SRC).toMatch(/router\.push\(buildGeneratorUrl\(profileId, selectedDocumentId \?\? undefined, mode\)\)/);
    expect(PAGE_SRC).not.toMatch(/ExamGenerator|generateWeakTopicsPracticeExam|generateFullSimulationExam/);
  });
});
