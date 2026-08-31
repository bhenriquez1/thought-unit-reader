// tests/notelab/evidenceAsProvenance.test.ts
// P4 (Professor/Current/Eye Guide/Whiteboard/NoteLab correction) —
// "Evidence remains INTERNAL — no separate visible Evidence workspace
// competing with the notebook; provenance ... lives behind each object,
// exposed only via per-object actions (View Source/Jump to Reader/Ask
// Professor) when selected." The user's own explicit choice: "Remove the
// standing panel entirely — no visible Evidence section under notes at
// all."
//
// M5 had woven a standing "🔬 EVIDENCE" panel (LearningSourcesManager +
// EvidenceWorkspace) into every expanded note in UltraNotesList.tsx,
// always visible regardless of the notebook/study-page view toggle. This
// phase removes that panel and its now-orphaned components entirely.
// N4's per-object BlockActionPanel on the tldraw notebook canvas already
// covers per-object provenance for notebook view — this phase does not
// touch it, only re-affirms it is still intact.

import fs from "fs";
import path from "path";

const NOTES_LIST = path.resolve(__dirname, "../../components/notelab/UltraNotesList.tsx");
const NOTEBOOK_CANVAS = path.resolve(__dirname, "../../components/notelab/NotebookCanvas.tsx");
const INDEX = path.resolve(__dirname, "../../pages/index.tsx");

describe("components/notelab/UltraNotesList.tsx — no standing Evidence panel", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(NOTES_LIST, "utf8"); });

  it("REQUIRED: no longer imports LearningSourcesManager", () => {
    expect(src).not.toMatch(/LearningSourcesManager/);
  });

  it("REQUIRED: no longer renders the '🔬 EVIDENCE' standing panel heading", () => {
    expect(src).not.toMatch(/🔬 EVIDENCE/);
  });

  it("REQUIRED: no longer carries the showEvidence toggle state — there is no panel left to toggle", () => {
    expect(src).not.toMatch(/showEvidence/);
  });

  it("REQUIRED: no longer accepts surgeonPageTruthKey/groundedAnnotations/studyModel props — they existed only to feed the removed panel", () => {
    expect(src).not.toMatch(/surgeonPageTruthKey/);
    expect(src).not.toMatch(/groundedAnnotations/);
    expect(src).not.toMatch(/GroundedSurgeonAnnotation/);
  });

  it("NU4 — the collapsed per-note SOURCE REFERENCES accordion this phase originally added is itself now removed; provenance access must not have gone to zero as a result", () => {
    expect(src).not.toMatch(/SOURCE REFERENCES/);
    // N4's per-object BlockActionPanel (View Source, gated on a real
    // canonicalUnitId) on the notebook canvas is what replaced it — see the
    // describe block below, which re-affirms that path is still wired.
    expect(src).toMatch(/onViewSource=\{handleViewSourceBlock\}/);
  });
});

describe("components/notelab/LearningSourcesManager.tsx / EvidenceWorkspace.tsx — deleted", () => {
  it("REQUIRED: LearningSourcesManager.tsx no longer exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../components/notelab/LearningSourcesManager.tsx"))).toBe(false);
  });

  it("REQUIRED: EvidenceWorkspace.tsx no longer exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../components/notelab/EvidenceWorkspace.tsx"))).toBe(false);
  });
});

describe("pages/index.tsx — no longer feeds the removed panel's props into UltraNotesList", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX, "utf8"); });

  it("REQUIRED: the <UltraNotesList> call site no longer passes surgeonPageTruthKey/groundedAnnotations/studyModel", () => {
    const callIdx = src.indexOf("<UltraNotesList");
    const closeIdx = src.indexOf("/>", callIdx);
    const block = src.slice(callIdx, closeIdx);
    expect(block).not.toMatch(/surgeonPageTruthKey=/);
    expect(block).not.toMatch(/groundedAnnotations=/);
    expect(block).not.toMatch(/studyModel=/);
  });
});

describe("components/notelab/NotebookCanvas.tsx — N4 per-object provenance actions are unaffected by the P4 removal", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(NOTEBOOK_CANVAS, "utf8"); });

  it("still offers View Source / Jump to Reader / Ask Professor on the selected-block action panel", () => {
    expect(src).toMatch(/👁️ View Source/);
    expect(src).toMatch(/📍 Jump to Reader/);
    expect(src).toMatch(/🎓 Ask Professor/);
  });

  it("View Source is still gated on a real canonicalUnitId — never offered for a block with no provenance to show", () => {
    expect(src).toMatch(/showViewSource = !!onViewSource && !!block\.canonicalUnitId/);
  });
});
