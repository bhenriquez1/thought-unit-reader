import fs from "fs";
import path from "path";

// L4 (Learning Hub orchestration correction) — "Learning Hub should
// understand whether a concept has durable notes... Do not use note
// creation itself as mastery evidence." These are source-inspection tests
// (no jsdom harness exists for these two large client components — see the
// L3 precedent in readerExposureWiring.test.ts on the L3 branch) verifying
// that both real NoteLab write paths fire a "notelab" exposure event, and
// only an exposure event, never a score field.

const rightPanelSource = fs.readFileSync(
  path.join(__dirname, "../../components/reader/RightPanel.tsx"),
  "utf8",
);
const ultraNotesListSource = fs.readFileSync(
  path.join(__dirname, "../../components/notelab/UltraNotesList.tsx"),
  "utf8",
);

describe("RightPanel.tsx — recordNoteLabExposure (composeNoteNotebookSceneInBackground)", () => {
  it("imports recordLearningEvent", () => {
    expect(rightPanelSource).toMatch(
      /import\s*\{\s*recordLearningEvent\s*\}\s*from\s*"@\/lib\/knowledge\/recordLearningEvent"/,
    );
  });

  it("defines a recordNoteLabExposure helper gated on knowledgeNodeId and documentId", () => {
    expect(rightPanelSource).toMatch(
      /function recordNoteLabExposure\(note: UltraNote\) \{\s*\n\s*if \(!note\.knowledgeNodeId \|\| !note\.documentId\) return;/,
    );
  });

  it("fires an exposure event with sourceType notelab, keyed to the note's own id", () => {
    const helperMatch = rightPanelSource.match(
      /function recordNoteLabExposure\(note: UltraNote\) \{[\s\S]*?\n  \}/,
    );
    expect(helperMatch).toBeTruthy();
    const helperBody = helperMatch![0];
    expect(helperBody).toMatch(/kind:\s*"exposure"/);
    expect(helperBody).toMatch(/sourceType:\s*"notelab"/);
    expect(helperBody).toMatch(/sourceId:\s*note\.id/);
    expect(helperBody).toMatch(/note\.pageTruthKey/);
  });

  it("never touches understandingScore/recallScore/masteryScore directly", () => {
    const helperMatch = rightPanelSource.match(
      /function recordNoteLabExposure\(note: UltraNote\) \{[\s\S]*?\n  \}/,
    );
    const helperBody = helperMatch![0];
    expect(helperBody).not.toMatch(/understandingScore|recallScore|masteryScore/);
  });

  it("is fire-and-forget: errors are caught and logged, never thrown into the caller", () => {
    const helperMatch = rightPanelSource.match(
      /function recordNoteLabExposure\(note: UltraNote\) \{[\s\S]*?\n  \}/,
    );
    const helperBody = helperMatch![0];
    expect(helperBody).toMatch(/\.catch\(/);
    expect(helperBody).toMatch(/console\.error\(\s*"\[NOTELAB_EXPOSURE_RECORD_ERROR\]"/);
  });

  it("is called from the zero-canonical-units deterministic-scene branch", () => {
    const deterministicBranch = rightPanelSource.match(
      /if \(units\.length === 0\) \{[\s\S]*?\n\s*return;\s*\n\s*\}/,
    );
    expect(deterministicBranch).toBeTruthy();
    expect(deterministicBranch![0]).toMatch(/recordNoteLabExposure\(existingNote\);/);
  });

  it("is called from the main AI-synthesis success path, after the note is saved", () => {
    const saveIdx = rightPanelSource.indexOf(
      "await saveUltraNote({ ...latest, notebookScene: mergedScene, notebookSceneError: undefined });",
    );
    const exposureIdx = rightPanelSource.indexOf("recordNoteLabExposure(latest);");
    expect(saveIdx).toBeGreaterThan(-1);
    expect(exposureIdx).toBeGreaterThan(saveIdx);
  });

  it("is not called from the catch/failure branch's own deterministic-scene fallback", () => {
    const catchBranch = rightPanelSource.slice(rightPanelSource.indexOf("} catch (err) {"));
    const fallbackCallEnd = catchBranch.indexOf("saveDeterministicNotebookScene(");
    expect(fallbackCallEnd).toBeGreaterThan(-1);
    const afterFallbackCall = catchBranch.slice(fallbackCallEnd, fallbackCallEnd + 400);
    expect(afterFallbackCall).not.toMatch(/recordNoteLabExposure/);
  });
});

describe("UltraNotesList.tsx — handleSaveStudentNotes exposure wiring", () => {
  it("imports recordLearningEvent", () => {
    expect(ultraNotesListSource).toMatch(
      /import\s*\{\s*recordLearningEvent\s*\}\s*from\s*"@\/lib\/knowledge\/recordLearningEvent"/,
    );
  });

  it("fires an exposure event after saveUltraNote, gated on knowledgeNodeId and documentId", () => {
    const handlerMatch = ultraNotesListSource.match(
      /async function handleSaveStudentNotes\(\) \{[\s\S]*?\n  \}/,
    );
    expect(handlerMatch).toBeTruthy();
    const handlerBody = handlerMatch![0];

    const saveIdx = handlerBody.indexOf("await saveUltraNote(");
    const gateIdx = handlerBody.indexOf("if (updated.knowledgeNodeId && updated.documentId)");
    expect(saveIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(saveIdx);

    expect(handlerBody).toMatch(/kind:\s*"exposure"/);
    expect(handlerBody).toMatch(/sourceType:\s*"notelab"/);
    expect(handlerBody).toMatch(/sourceId:\s*updated\.id/);
    expect(handlerBody).toMatch(/updated\.pageTruthKey/);
  });

  it("never touches understandingScore/recallScore/masteryScore directly", () => {
    const handlerMatch = ultraNotesListSource.match(
      /async function handleSaveStudentNotes\(\) \{[\s\S]*?\n  \}/,
    );
    const handlerBody = handlerMatch![0];
    expect(handlerBody).not.toMatch(/understandingScore|recallScore|masteryScore/);
  });

  it("is fire-and-forget: errors are caught and logged, never thrown into the caller", () => {
    const handlerMatch = ultraNotesListSource.match(
      /async function handleSaveStudentNotes\(\) \{[\s\S]*?\n  \}/,
    );
    const handlerBody = handlerMatch![0];
    expect(handlerBody).toMatch(/\.catch\(/);
    expect(handlerBody).toMatch(/console\.error\(\s*"\[NOTELAB_EXPOSURE_RECORD_ERROR\]"/);
  });

  it("does not block setStudentSaveState(\"saved\") from firing on the same tick", () => {
    const handlerMatch = ultraNotesListSource.match(
      /async function handleSaveStudentNotes\(\) \{[\s\S]*?\n  \}/,
    );
    const handlerBody = handlerMatch![0];
    const exposureIdx = handlerBody.indexOf("recordLearningEvent(");
    const savedStateIdx = handlerBody.indexOf('setStudentSaveState("saved")');
    expect(exposureIdx).toBeGreaterThan(-1);
    expect(savedStateIdx).toBeGreaterThan(exposureIdx);
    expect(handlerBody.slice(exposureIdx, savedStateIdx)).not.toMatch(/^\s*await\s+recordLearningEvent/);
  });
});
