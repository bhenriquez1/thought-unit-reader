// tests/elena/dailyLimit.test.ts
// Pure-logic coverage for lib/elena/dailyLimit.ts — P1 fix (Elena parental
// controls: daily reading-time limit). Real behavioral tests, not source
// inspection, since these are pure functions with no IDB/DOM dependency.

import { rollDailyMinutes, addDailyMinutes, isDailyLimitReached } from "@/lib/elena/dailyLimit";
import type { ChildProgress } from "@/lib/elena/types";

function makeProgress(overrides: Partial<ChildProgress> = {}): ChildProgress {
  return {
    childProfileId: "child-1",
    currentLevel:   "developing",
    booksCompleted: 0,
    totalSessions:  0,
    totalMinutes:   0,
    totalWordsRead: 0,
    lastActiveAt:   "2026-08-20T00:00:00.000Z",
    updatedAt:      "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("rollDailyMinutes", () => {
  it("keeps todayMinutes when the stored date matches today", () => {
    const rolled = rollDailyMinutes({ todayMinutes: 12, todayDate: "2026-08-24" }, "2026-08-24");
    expect(rolled).toEqual({ todayMinutes: 12, todayDate: "2026-08-24" });
  });

  it("REQUIRED: resets to 0 when the stored date is a previous day", () => {
    const rolled = rollDailyMinutes({ todayMinutes: 45, todayDate: "2026-08-23" }, "2026-08-24");
    expect(rolled).toEqual({ todayMinutes: 0, todayDate: "2026-08-24" });
  });

  it("treats a missing todayDate (pre-migration record) as needing a roll-over", () => {
    const rolled = rollDailyMinutes({ todayMinutes: undefined, todayDate: undefined }, "2026-08-24");
    expect(rolled).toEqual({ todayMinutes: 0, todayDate: "2026-08-24" });
  });
});

describe("addDailyMinutes", () => {
  it("adds to both totalMinutes (lifetime) and todayMinutes (rolled over) on the same day", () => {
    const base = makeProgress({ totalMinutes: 100, todayMinutes: 10, todayDate: "2026-08-24" });
    const next = addDailyMinutes(base, 5, "2026-08-24");
    expect(next.totalMinutes).toBe(105);
    expect(next.todayMinutes).toBe(15);
    expect(next.todayDate).toBe("2026-08-24");
  });

  it("REQUIRED: rolls todayMinutes over first when crossing a date boundary — yesterday's minutes never leak into today's count", () => {
    const base = makeProgress({ totalMinutes: 100, todayMinutes: 45, todayDate: "2026-08-23" });
    const next = addDailyMinutes(base, 5, "2026-08-24");
    expect(next.totalMinutes).toBe(105);
    expect(next.todayMinutes).toBe(5);
    expect(next.todayDate).toBe("2026-08-24");
  });

  it("does not mutate the input progress", () => {
    const base = makeProgress({ totalMinutes: 100, todayMinutes: 10, todayDate: "2026-08-24" });
    addDailyMinutes(base, 5, "2026-08-24");
    expect(base.totalMinutes).toBe(100);
    expect(base.todayMinutes).toBe(10);
  });
});

describe("isDailyLimitReached", () => {
  it("REQUIRED: a null limit never blocks, regardless of today's minutes", () => {
    const progress = makeProgress({ todayMinutes: 500, todayDate: "2026-08-24" });
    expect(isDailyLimitReached(progress, null, "2026-08-24")).toBe(false);
  });

  it("a zero or negative limit is treated as no limit", () => {
    const progress = makeProgress({ todayMinutes: 500, todayDate: "2026-08-24" });
    expect(isDailyLimitReached(progress, 0, "2026-08-24")).toBe(false);
    expect(isDailyLimitReached(progress, -5, "2026-08-24")).toBe(false);
  });

  it("false when no progress record exists yet", () => {
    expect(isDailyLimitReached(null, 30, "2026-08-24")).toBe(false);
  });

  it("REQUIRED: false while under the limit, true once today's minutes reach it", () => {
    const under = makeProgress({ todayMinutes: 29, todayDate: "2026-08-24" });
    const atLimit = makeProgress({ todayMinutes: 30, todayDate: "2026-08-24" });
    expect(isDailyLimitReached(under, 30, "2026-08-24")).toBe(false);
    expect(isDailyLimitReached(atLimit, 30, "2026-08-24")).toBe(true);
  });

  it("REQUIRED: a lifetime total past the limit does NOT block on its own — only today's rolled-over minutes count", () => {
    // This is the exact bug this module exists to prevent: a child who has
    // ever read 30+ minutes total must not be immediately blocked on a
    // brand-new day just because totalMinutes is large.
    const progress = makeProgress({ totalMinutes: 5000, todayMinutes: 2, todayDate: "2026-08-24" });
    expect(isDailyLimitReached(progress, 30, "2026-08-24")).toBe(false);
  });

  it("rolls over a stale todayDate before comparing — yesterday's minutes at the limit don't block a fresh day", () => {
    const progress = makeProgress({ todayMinutes: 60, todayDate: "2026-08-23" });
    expect(isDailyLimitReached(progress, 30, "2026-08-24")).toBe(false);
  });
});
