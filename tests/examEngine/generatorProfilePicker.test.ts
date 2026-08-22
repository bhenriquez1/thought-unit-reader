// tests/examEngine/generatorProfilePicker.test.ts
// Product-split Phase 1, item 2 — app/apex/generator/page.tsx no longer
// hardcodes DAT_EXAM_PROFILE; a real profile picker chooses between DAT and
// Custom Exam, proving examBuilder/buildExam isn't secretly DAT-coupled.
// No jsdom/render harness for App Router pages in this repo — source
// inspection, matching this repo's established pattern for React components.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/generator/page.tsx"), "utf8");

describe("app/apex/generator/page.tsx — exam profile is a real choice, not a hardcoded constant", () => {
  it("REQUIRED: imports CUSTOM_EXAM_PROFILE alongside DAT_EXAM_PROFILE", () => {
    expect(SRC).toMatch(/import \{ DAT_EXAM_PROFILE \} from '@\/lib\/examEngine\/profiles\/datProfile';/);
    expect(SRC).toMatch(/import \{ CUSTOM_EXAM_PROFILE, CUSTOM_EXAM_PROFILE_ID \} from '@\/lib\/examEngine\/profiles\/customProfile';/);
  });

  it("REQUIRED: examProfileId is real state with a picker UI, not a hardcoded constant", () => {
    expect(SRC).toMatch(/const \[examProfileId, setExamProfileId\] = useState/);
    expect(SRC).toMatch(/onClick=\{\(\) => handleProfileChange\('dat'\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => handleProfileChange\(CUSTOM_EXAM_PROFILE_ID\)\}/);
  });

  it("REQUIRED: switching profile clears any already-generated exam and error, so Start can never launch an exam built under the previous profile", () => {
    const idx = SRC.indexOf("function handleProfileChange(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 300);
    expect(block).toMatch(/setExamProfileId\(id\);/);
    expect(block).toMatch(/setGeneratedExam\(null\);/);
    expect(block).toMatch(/setGenerationError\(null\);/);
  });

  it("REQUIRED: generateExam() passes the selected profile, not a hardcoded DAT_EXAM_PROFILE", () => {
    const idx = SRC.indexOf("async function generateExam()");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 900);
    expect(block).toMatch(/profile: selectedProfile,/);
    expect(block).not.toMatch(/profile: DAT_EXAM_PROFILE,/);
  });

  it("REQUIRED: DAT section checkboxes only apply when the DAT profile is selected — buildExam's sectionIds is never DAT section ids under a Custom profile", () => {
    const idx = SRC.indexOf("async function generateExam()");
    const block = SRC.slice(idx, idx + 900);
    expect(block).toMatch(/sectionIds: examProfileId === 'dat' && sectionIds\.length \? sectionIds : undefined,/);
  });

  it("the DAT Sections checkbox UI is gated behind examProfileId === 'dat', with a distinct Custom-mode explanation", () => {
    expect(SRC).toMatch(/\{examProfileId === 'dat' \? \(/);
    expect(SRC).toMatch(/Custom Exam draws from your entire selected source/);
  });

  it("the exam summary panel reflects the selected exam type, not just DAT-shaped fields", () => {
    expect(SRC).toMatch(/<span className="text-gray-400">Exam Type:<\/span>/);
  });
});
