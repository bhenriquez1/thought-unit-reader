// tests/adaptiveGuide/studentProfile.test.ts

import {
  buildStudentProfile,
  classifyLearnerState,
  type ReadingSession,
  type RecallAttempt,
} from "../../lib/adaptiveGuide/studentProfile";

const BOOK = "book-1";
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function session(pageIndex: number, durationMs = 60_000): ReadingSession {
  return { bookId: BOOK, pageIndex, startedAt: NOW - durationMs, durationMs };
}

function recall(
  unitId: string,
  correct: boolean,
  streak = 1,
  daysAgo = 0,
): RecallAttempt {
  return {
    unitId,
    bookId: BOOK,
    pageIndex: 1,
    correct,
    streak,
    attemptedAt: NOW - daysAgo * DAY,
  };
}

describe("buildStudentProfile", () => {
  it("returns empty profile when no sessions or recalls", () => {
    const p = buildStudentProfile(BOOK, [], []);
    expect(p.visitedPages).toHaveLength(0);
    expect(p.overallMastery).toBe(0);
    expect(p.recentMisses).toHaveLength(0);
  });

  it("tracks visited pages and dedupes them", () => {
    const sessions = [session(1), session(1), session(3)];
    const p = buildStudentProfile(BOOK, sessions, []);
    expect(p.visitedPages).toEqual([1, 3]);
  });

  it("identifies revisited pages", () => {
    const sessions = [session(2), session(2), session(5)];
    const p = buildStudentProfile(BOOK, sessions, []);
    expect(p.revisitedPages).toContain(2);
    expect(p.revisitedPages).not.toContain(5);
  });

  it("sums total reading time across sessions", () => {
    const sessions = [session(1, 30_000), session(2, 90_000)];
    const p = buildStudentProfile(BOOK, sessions, []);
    expect(p.totalReadingMs).toBe(120_000);
  });

  it("marks units with streak ≥ 3 as mastered", () => {
    const recalls = [recall("u1", true, 3), recall("u2", true, 2)];
    const p = buildStudentProfile(BOOK, [], recalls);
    expect(p.masteredUnitIds).toContain("u1");
    expect(p.masteredUnitIds).not.toContain("u2");
  });

  it("includes recent misses from the last 7 days", () => {
    const recalls = [recall("u1", false, 0, 2), recall("u2", false, 0, 8)];
    const p = buildStudentProfile(BOOK, [], recalls);
    expect(p.recentMisses).toContain("u1");
    expect(p.recentMisses).not.toContain("u2"); // 8 days ago is outside window
  });

  it("ignores sessions for other books", () => {
    const sessions = [{ bookId: "other-book", pageIndex: 1, startedAt: NOW, durationMs: 5000 }];
    const p = buildStudentProfile(BOOK, sessions, []);
    expect(p.visitedPages).toHaveLength(0);
  });
});

describe("classifyLearnerState", () => {
  it("returns first-read for unvisited page", () => {
    const p = buildStudentProfile(BOOK, [session(2)], []);
    expect(classifyLearnerState(5, p)).toBe("first-read");
  });

  it("returns second-read for visited page with no recall", () => {
    const p = buildStudentProfile(BOOK, [session(3)], []);
    expect(classifyLearnerState(3, p)).toBe("second-read");
  });

  it("returns needs-review when recent misses exist", () => {
    const p = buildStudentProfile(BOOK, [session(1)], [recall("u1", false, 0, 1)]);
    expect(classifyLearnerState(1, p)).toBe("needs-review");
  });

  it("returns active-recall when visited and mastered, no misses", () => {
    const p = buildStudentProfile(BOOK, [session(1)], [recall("u1", true, 3, 2)]);
    expect(classifyLearnerState(1, p)).toBe("active-recall");
  });
});
