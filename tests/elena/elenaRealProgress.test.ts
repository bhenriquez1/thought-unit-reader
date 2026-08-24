// tests/elena/elenaRealProgress.test.ts
// P1 fix ("Avrrio Master Audit," item 30 — Real AR-style progress).
// ChildProgress.totalMinutes and .booksCompleted were both initialized to
// zero and never written anywhere in the codebase — "Minutes Read" showed a
// permanent em-dash, "Books Finished" showed a permanent 0, and several
// AdventureMap quest tiers requiring booksCompleted >= 1 were mathematically
// unreachable by any user action. This locks in the two real writers added
// to components/elena/ElenaChildWorkspace.tsx:
//   - a session timer keyed on being on the Reading tab with a book open,
//     persisting real elapsed minutes on cleanup (tab switch / book switch
//     / unmount) — not a manual button tap
//   - book-completion detection, driven by real page-turns reaching the
//     book's real last page (lib/elena/childBooks.ts's
//     mergeLibraryEntryProgress/isNewlyCompleted), incrementing
//     booksCompleted exactly once per book, never on re-reads
//
// No jsdom/render harness for this file in this repo — source inspection,
// matching this repo's established pattern for React components. The pure
// completion-detection logic itself (mergeLibraryEntryProgress,
// isNewlyCompleted) has real behavioral tests in tests/elena/childBooks.test.ts.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/elena/ElenaChildWorkspace.tsx"), "utf8");

describe("ElenaChildWorkspace.tsx — real session-time tracking (totalMinutes)", () => {
  it("REQUIRED: a timer starts only while the Reading tab is showing an open book, not on every render", () => {
    const idx = SRC.indexOf("if (!(activeTab === \"reading\" && activeBook && profile)) return;");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: elapsed time is computed and persisted in the effect's cleanup — fires on tab switch, book switch, and unmount alike", () => {
    const idx = SRC.indexOf("if (!(activeTab === \"reading\" && activeBook && profile)) return;");
    const block = SRC.slice(idx, idx + 900);
    expect(block).toMatch(/return \(\) => \{/);
    expect(block).toMatch(/const elapsedMinutes = Math\.round\(\(Date\.now\(\) - startedAt\) \/ 60000\);/);
    expect(block).toMatch(/totalMinutes: base\.totalMinutes \+ elapsedMinutes,/);
    expect(block).toMatch(/saveChildProgress\(next\)\.catch\(\(\) => \{\}\);/);
  });

  it("a session under 1 minute is silently dropped instead of writing a spurious 0-minute update", () => {
    const idx = SRC.indexOf("if (!(activeTab === \"reading\" && activeBook && profile)) return;");
    const block = SRC.slice(idx, idx + 900);
    expect(block).toMatch(/if \(elapsedMinutes <= 0\) return;/);
  });

  it("the effect re-keys on activeTab, activeBook?.id, and profile — switching books while reading correctly closes out the previous book's session", () => {
    const idx = SRC.indexOf("if (!(activeTab === \"reading\" && activeBook && profile)) return;");
    const block = SRC.slice(idx, idx + 1100);
    expect(block).toMatch(/\}, \[activeTab, activeBook\?\.id, profile\]\);/);
  });
});

describe("ElenaChildWorkspace.tsx — real book-completion detection (booksCompleted)", () => {
  it("REQUIRED: imports mergeLibraryEntryProgress and isNewlyCompleted from childBooks.ts instead of hand-rolling completion logic", () => {
    const idx = SRC.indexOf("} from \"@/lib/elena/childBooks\";");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(Math.max(0, idx - 300), idx);
    expect(block).toMatch(/mergeLibraryEntryProgress,/);
    expect(block).toMatch(/isNewlyCompleted,/);
  });

  it("REQUIRED: handleBookPageChange and handleBookPageCount both use mergeLibraryEntryProgress for the local update, not an ad-hoc spread that would skip completion stamping", () => {
    const changeIdx = SRC.indexOf("const handleBookPageChange = useCallback");
    const countIdx = SRC.indexOf("const handleBookPageCount = useCallback");
    expect(changeIdx).toBeGreaterThan(-1);
    expect(countIdx).toBeGreaterThan(changeIdx);
    const changeBlock = SRC.slice(changeIdx, countIdx);
    const countBlock = SRC.slice(countIdx, countIdx + 500);
    expect(changeBlock).toMatch(/const updated = mergeLibraryEntryProgress\(prev, \{ currentPage: page \}, now\);/);
    expect(changeBlock).toMatch(/markBookCompletedIfNeeded\(prev, updated\);/);
    expect(countBlock).toMatch(/const updated = mergeLibraryEntryProgress\(prev, \{ totalPages: total \}, now\);/);
    expect(countBlock).toMatch(/markBookCompletedIfNeeded\(prev, updated\);/);
  });

  it("REQUIRED: markBookCompletedIfNeeded only increments booksCompleted when isNewlyCompleted reports true — never on a re-read of an already-finished book", () => {
    const idx = SRC.indexOf("const markBookCompletedIfNeeded = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/if \(!profile \|\| !isNewlyCompleted\(previous, updated\)\) return;/);
    expect(block).toMatch(/booksCompleted: base\.booksCompleted \+ 1,/);
    expect(block).toMatch(/saveChildProgress\(next\)\.catch\(\(\) => \{\}\);/);
  });
});
