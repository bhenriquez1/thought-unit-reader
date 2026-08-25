// tests/stickyNotes/stickyNotesWiring.test.ts
// C1 — Reader Sticky Notes. Confirms the rail is actually mounted in the
// Reader's PDF-viewer pane with real identity provenance, and that the
// dead legacy Sticky Note files (orphaned components, never imported
// outside themselves — see Phase 0 audit) are gone.
//
// No jsdom/render harness for pages/index.tsx in this repo — source
// inspection, matching this repo's established pattern for this file.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("pages/index.tsx — StickyNotesRail is mounted with real identity provenance", () => {
  it("REQUIRED: imports StickyNotesRail from components/reader", () => {
    expect(SRC).toMatch(/import StickyNotesRail\s+from "@\/components\/reader\/StickyNotesRail";/);
  });

  it("REQUIRED: mounted with resolvedDocumentId (not bookId/fileId), pageTruthKey, and the real current page", () => {
    const idx = SRC.indexOf("<StickyNotesRail");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 300);
    expect(block).toMatch(/documentId=\{resolvedDocumentId\}/);
    expect(block).toMatch(/pageTruthKey=\{pageTruthKey\}/);
    expect(block).toMatch(/pageNumber=\{currentPage\}/);
  });

  it("REQUIRED: only mounts once a resolved document identity exists — never renders with an empty/undefined documentId", () => {
    const idx = SRC.indexOf("<StickyNotesRail");
    const block = SRC.slice(Math.max(0, idx - 60), idx);
    expect(block).toMatch(/\{resolvedDocumentId && \(/);
  });

  it("REQUIRED: jump-to-page reuses the existing syncToPage navigation path, not a new one", () => {
    const idx = SRC.indexOf("<StickyNotesRail");
    const block = SRC.slice(idx, idx + 300);
    expect(block).toMatch(/onJumpToPage=\{\(page\) => syncToPage\(page, \{ reason: 'TOC_JUMP' \}\)\}/);
  });
});

describe("Dead legacy Sticky Note files are removed, not left alongside the real implementation", () => {
  const repoRoot = path.resolve(__dirname, "../..");
  const deadFiles = [
    "types/StickyNote.ts",
    "lib/StickyNoteService.ts",
    "components/StickyNotePanel.tsx",
    "components/StickyNoteDrawer.tsx",
  ];

  it.each(deadFiles)("REQUIRED: %s no longer exists", (relPath) => {
    expect(fs.existsSync(path.join(repoRoot, relPath))).toBe(false);
  });
});
