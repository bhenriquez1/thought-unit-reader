import fs from "fs";
import path from "path";

const PANEL = path.resolve(__dirname, "../../components/reader/StudySpeechPanel.tsx");
const RIGHT_PANEL = path.resolve(__dirname, "../../components/reader/RightPanel.tsx");
const WHITEBOARD = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");

describe("Reader Speech Phase 2 — exactly two visible experiences", () => {
  const panel = fs.readFileSync(PANEL, "utf8");
  const rightPanel = fs.readFileSync(RIGHT_PANEL, "utf8");
  const whiteboard = fs.readFileSync(WHITEBOARD, "utf8");

  it("exposes only Current Page and Professor in the live mode selector", () => {
    const start = panel.indexOf("const VISIBLE_SPEECH_MODES");
    const end = panel.indexOf("];", start);
    const visibleModes = panel.slice(start, end + 2);

    expect([...visibleModes.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]))
      .toEqual(["currentPage", "professor"]);
    expect([...visibleModes.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]))
      .toEqual(["Current Page", "Professor"]);
    expect(panel).not.toContain("STUDY_SPEECH_MODES");
  });

  it("defaults to Current Page and delegates Professor to the existing Whiteboard engine", () => {
    expect(panel).toMatch(/useState<VisibleSpeechMode>\("currentPage"\)/);
    expect(panel).toMatch(/onClick=\{\(\) => onOpenProfessor\?\.\(\)\}/);
    expect(panel).toContain("Open Professor Whiteboard");
    expect(panel).toContain("Narration and drawing stay synchronized");
    expect(rightPanel).toContain("onOpenProfessor={onOpenWhiteboard}");
    expect(whiteboard).toContain('import { useProfessorLesson }');
  });

  it("keeps Current Page source-faithful from segmentation through both TTS fallbacks", () => {
    expect(panel).toContain("buildCurrentPageSpeechSegments(activePageText)");
    expect(panel).not.toContain("/api/speech-preprocess");
    expect(panel).toContain('fetchAndPlayAudio(ttsText, session, "SOURCE_VERBATIM")');
    expect(panel).toContain('playBrowserSpeech(result.script, resolve, session, "SOURCE_VERBATIM")');
    expect(panel).toContain("const startIdx = Math.max(0, Math.min(fromIdx");
    expect(panel).toContain('startMode: fromIdx === 0 ? "page-start" : "explicit-cursor"');
  });

  it("marks Whiteboard narration explicitly as Professor explanation", () => {
    expect(whiteboard).toContain('contentRole: "PROFESSOR_EXPLANATION"');
  });
});
