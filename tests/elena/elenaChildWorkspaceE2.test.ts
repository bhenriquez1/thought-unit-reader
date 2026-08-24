// tests/elena/elenaChildWorkspaceE2.test.ts
// E2 (Elena foundation) — static-analysis coverage for
// components/elena/ElenaChildWorkspace.tsx: Elena now owns her own
// document/library state instead of mirroring the adult Reader tab's
// currently-open file, a real profile switcher is wired in, and the
// "reading" tab mounts a real PDF reader (ChildReaderTab) instead of the
// old placeholder-only ContinueReadingTab.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/elena/ElenaChildWorkspace.tsx"),
  "utf8",
);

describe("ElenaChildWorkspace — owns its own document identity (no longer mirrors the adult Reader tab)", () => {
  it("REQUIRED: no longer accepts bookTitle/currentPage/totalPages/pageText props from the caller", () => {
    const idx = SRC.indexOf("interface ElenaChildWorkspaceProps");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, SRC.indexOf("}", idx) + 1);
    expect(block).not.toMatch(/bookTitle/);
    expect(block).not.toMatch(/currentPage/);
    expect(block).not.toMatch(/totalPages/);
    expect(block).not.toMatch(/pageText/);
  });

  it("REQUIRED: the old ContinueReadingTab (parasitic on caller-supplied book props) has been removed", () => {
    expect(SRC).not.toMatch(/function ContinueReadingTab/);
  });

  it("imports the upload/library helpers from lib/elena/childBooks — reuses the shared document store, not a new pipeline", () => {
    expect(SRC).toMatch(/from "@\/lib\/elena\/childBooks"/);
    expect(SRC).toMatch(/uploadChildBook/);
    expect(SRC).toMatch(/loadChildBookFileUrl/);
    expect(SRC).toMatch(/listChildLibraryEntries/);
    expect(SRC).toMatch(/pickMostRecentEntry/);
  });

  it("REQUIRED: library entries are (re)loaded whenever the active profile id changes — switching learners must not leak books across children", () => {
    const idx = SRC.indexOf("listChildLibraryEntries(profile.id)");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(Math.max(0, idx - 400), idx);
    expect(block).toMatch(/useEffect\(/);
  });

  it("revokes the active book's blob: URL when it is replaced or the component unmounts", () => {
    expect(SRC).toMatch(/URL\.revokeObjectURL\(bookFileUrlRef\.current\)/);
  });
});

describe("ElenaChildWorkspace — profile switcher", () => {
  it("imports and renders ChildProfileSwitcher", () => {
    expect(SRC).toMatch(/import ChildProfileSwitcher from "@\/components\/elena\/ChildProfileSwitcher";/);
    expect(SRC).toMatch(/<ChildProfileSwitcher/);
  });

  it("REQUIRED: switching profiles writes the new active id to the same STORAGE_KEY the initial load reads from", () => {
    const idx = SRC.indexOf("const handleSwitchProfile");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 500);
    expect(block).toMatch(/safeSetItem\(STORAGE_KEY, p\.id\)/);
  });

  it("switching profiles resets per-book state so the new child does not inherit the old child's open book", () => {
    const idx = SRC.indexOf("const handleSwitchProfile");
    const block = SRC.slice(idx, idx + 500);
    expect(block).toMatch(/resetBookState\(\)/);
  });
});

describe("ElenaChildWorkspace — Reader tab is a real PDF reader", () => {
  it("REQUIRED: the 'reading' tab renders ChildReaderTab, not the removed ContinueReadingTab", () => {
    // Matches only the JSX conditional render, not the P1 session-timer
    // effect's `if (!(activeTab === "reading" ...))` guard, which uses
    // different surrounding syntax and appears earlier in the file.
    const idx = SRC.indexOf('{activeTab === "reading" && (');
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 500);
    expect(block).toMatch(/<ChildReaderTab/);
  });

  it("wires page-change/page-count/page-text callbacks that persist back through updateBookProgress", () => {
    expect(SRC).toMatch(/const handleBookPageChange = useCallback/);
    expect(SRC).toMatch(/updateBookProgress\(prev, \{ currentPage: page \}\)/);
    expect(SRC).toMatch(/const handleBookPageCount = useCallback/);
    expect(SRC).toMatch(/updateBookProgress\(prev, \{ totalPages: total \}\)/);
  });

  it("REQUIRED: an upload flows through a single hidden file input shared by every 'Upload a Book' entry point", () => {
    expect(SRC).toMatch(/<input[\s\S]{0,120}type="file"[\s\S]{0,120}accept="application\/pdf"/);
    expect(SRC).toMatch(/const handleFileInputChange = useCallback/);
  });
});

describe("ElenaChildWorkspace — Library tab shows the child's real books", () => {
  it("REQUIRED: LibraryTab receives the live library array and an open-book handler, not just a completed-books count", () => {
    const idx = SRC.indexOf('activeTab === "library"');
    const block = SRC.slice(idx, idx + 300);
    expect(block).toMatch(/library=\{library\}/);
    expect(block).toMatch(/onOpenBook=\{openBook\}/);
  });
});
