// tests/examEngine/questionCacheProfileIdentity.test.ts
// P1 fix — flagged by an automated review on PR #670 (app/apex/results/
// page.tsx, which now trusts EngineQuestion.examProfileId to resolve which
// profile actually generated an exam). lib/examEngine/questionGenerator.ts's
// IndexedDB question cache was keyed on bookId+conceptId+questionType+
// difficulty — no examProfileId component. Building a DAT exam and a
// Custom Exam over the SAME book/concept/type/difficulty collided in the
// cache: whichever profile built first "won," and every subsequent build
// under the OTHER profile got back cached EngineQuestions still stamped
// with the FIRST profile's examProfileId, since examBuilder.ts never
// re-stamps examProfileId on what getOrGenerateQuestions returns — it's
// only sent as a request param on the cache-miss path. A cache hit under
// the wrong profile shipped a wrong examProfileId all the way to the
// results page's profile-resolution logic, silently corrupting scoring
// and analytics for whichever profile lost the race.
//
// cacheKey is a small pure function — exported so this is a real
// behavioral test, not source inspection.

import { cacheKey } from "../../lib/examEngine/questionGenerator";

describe("lib/examEngine/questionGenerator.ts — cacheKey is scoped per exam profile", () => {
  it("REQUIRED: two profiles building over the identical book/concept/type/difficulty get different cache keys", () => {
    const shared = { bookId: "book-1", conceptId: "concept-1", questionType: "application" as const, difficulty: "simulation" as const };
    const datKey = cacheKey({ ...shared, examProfileId: "dat" });
    const customKey = cacheKey({ ...shared, examProfileId: "custom" });
    expect(datKey).not.toBe(customKey);
  });

  it("the same profile building the same concept twice still hits the same cache key (no regression in the cache's actual purpose)", () => {
    const opts = { examProfileId: "dat", bookId: "book-1", conceptId: "concept-1", questionType: "application" as const, difficulty: "simulation" as const };
    expect(cacheKey(opts)).toBe(cacheKey({ ...opts }));
  });

  it("examProfileId is the leading key component, so two profiles never share a prefix that could collide under a different key scheme", () => {
    const key = cacheKey({ examProfileId: "dat", bookId: "book-1", conceptId: "concept-1", questionType: "application" as const, difficulty: "simulation" as const });
    expect(key.startsWith("dat::")).toBe(true);
  });
});
