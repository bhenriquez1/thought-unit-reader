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
    expect(block).toMatch(/addDailyMinutes\(base, elapsedMinutes, isoToday\(\)\)/);
    expect(block).toMatch(/saveChildProgress\(next\)\.catch\(\(\) => \{\}\);/);
  });

  it("a session under 1 minute is silently dropped instead of writing a spurious 0-minute update", () => {
    const idx = SRC.indexOf("if (!(activeTab === \"reading\" && activeBook && profile)) return;");
    const block = SRC.slice(idx, idx + 900);
    expect(block).toMatch(/if \(elapsedMinutes <= 0\) return;/);
  });

  it("the effect re-keys on activeTab, activeBook?.id, profile, and dailyLimitReached — switching books while reading correctly closes out the previous book's session, and the timer stops the instant the daily limit is hit", () => {
    const idx = SRC.indexOf("if (!(activeTab === \"reading\" && activeBook && profile)) return;");
    const block = SRC.slice(idx, idx + 1100);
    expect(block).toMatch(/\}, \[activeTab, activeBook\?\.id, profile, dailyLimitReached\]\);/);
  });
});

describe("ElenaChildWorkspace.tsx — parental daily reading-time limit (P1)", () => {
  it("REQUIRED: imports addDailyMinutes and isDailyLimitReached from lib/elena/dailyLimit instead of hand-rolling the roll-over logic", () => {
    expect(SRC).toMatch(/import \{ addDailyMinutes, isDailyLimitReached \} from "@\/lib\/elena\/dailyLimit";/);
  });

  it("REQUIRED: dailyLimitReached is derived from isDailyLimitReached(progress, dailyLimitMinutes, isoToday()) and gates the session timer", () => {
    const idx = SRC.indexOf("const dailyLimitReached = isDailyLimitReached(progress, dailyLimitMinutes, isoToday());");
    expect(idx).toBeGreaterThan(-1);
    const timerIdx = SRC.indexOf("if (!(activeTab === \"reading\" && activeBook && profile)) return;");
    expect(timerIdx).toBeGreaterThan(idx);
    const block = SRC.slice(timerIdx, timerIdx + 200);
    expect(block).toMatch(/if \(dailyLimitReached\) return;/);
  });

  it("REQUIRED: the parent-set limit is loaded per-profile via loadParentControlSettings, keyed by profile.id — a limit is per-child, not global", () => {
    const idx = SRC.indexOf("loadParentControlSettings(profile.id)");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: handleSetDailyLimit persists via saveParentControlSettings, keyed by the active profile", () => {
    const idx = SRC.indexOf("const handleSetDailyLimit = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 500);
    expect(block).toMatch(/childProfileId:\s*profile\.id,/);
    expect(block).toMatch(/dailyTimeLimitMinutes: minutes,/);
    expect(block).toMatch(/saveParentControlSettings\(settings\)/);
  });

  it("REQUIRED: the Reading tab renders a blocked state instead of ChildReaderTab once the limit is reached", () => {
    const idx = SRC.indexOf('{activeTab === "reading" && dailyLimitReached && (');
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 200);
    expect(block).toMatch(/<DailyLimitReachedCard/);
  });

  it("REQUIRED: ParentDashboard receives dailyLimitMinutes and onSetDailyLimit so the parent can view/change the limit", () => {
    const idx = SRC.indexOf("<ParentDashboard");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/dailyLimitMinutes=\{dailyLimitMinutes\}/);
    expect(block).toMatch(/onSetDailyLimit=\{handleSetDailyLimit\}/);
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
