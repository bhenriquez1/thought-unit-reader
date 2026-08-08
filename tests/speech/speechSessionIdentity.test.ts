// tests/speech/speechSessionIdentity.test.ts
// Regression coverage for lib/speech/speechSessionIdentity.ts — the shared
// identity introduced by the Speech Engine audit's PR A. The core guarantee
// this file protects: a caller-local id (a narration segment id like
// "seg0", or a `${voice}::${text}` audio key) qualified by two DIFFERENT
// SpeechSessionIdentity values must NEVER collide, even when every other
// surface detail (filename/bookId, segment id) is identical — this is what
// makes "page A's seg0 can never resolve to page B's audio" true by
// construction rather than by convention.

import {
  buildSpeechSessionKey,
  buildSpeechCacheKey,
  speechSessionIdentitiesEqual,
  type SpeechSessionIdentity,
} from "../../lib/speech/speechSessionIdentity";

function identity(overrides: Partial<SpeechSessionIdentity> = {}): SpeechSessionIdentity {
  return {
    documentId: "doc-a",
    pageNumber: 1,
    pageTruthKey: "doc-a::1::t",
    owner: "whiteboard",
    ...overrides,
  };
}

describe("buildSpeechCacheKey — cross-page/cross-document collision resistance", () => {
  it("REQUIRED: the SAME local id ('seg0') under two different pageNumbers never collides", () => {
    const pageA = buildSpeechCacheKey(identity({ pageNumber: 1 }), "seg0");
    const pageB = buildSpeechCacheKey(identity({ pageNumber: 2 }), "seg0");
    expect(pageA).not.toBe(pageB);
  });

  it("REQUIRED: the SAME local id under two different documentIds never collides, even with an identical filename-derived bookId elsewhere in the identity", () => {
    const docA = buildSpeechCacheKey(identity({ documentId: "uuid-111", pageTruthKey: "uuid-111::1::t" }), "seg0");
    const docB = buildSpeechCacheKey(identity({ documentId: "uuid-222", pageTruthKey: "uuid-222::1::t" }), "seg0");
    expect(docA).not.toBe(docB);
  });

  it("REQUIRED: a regenerated lesson (different lessonId) for the SAME page never collides with the prior lesson's cache entries", () => {
    const before = buildSpeechCacheKey(identity({ lessonId: "vsg-hash-1" }), "seg0");
    const after  = buildSpeechCacheKey(identity({ lessonId: "vsg-hash-2" }), "seg0");
    expect(before).not.toBe(after);
  });

  it("two different owners narrating the same page never share a cache namespace", () => {
    const whiteboard = buildSpeechCacheKey(identity({ owner: "whiteboard" }), "seg0");
    const reader      = buildSpeechCacheKey(identity({ owner: "study-speech" }), "seg0");
    expect(whiteboard).not.toBe(reader);
  });

  it("identical identity + identical local id DOES produce the identical key (cache reuse still works for the true-repeat case)", () => {
    const a = buildSpeechCacheKey(identity(), "seg0");
    const b = buildSpeechCacheKey(identity(), "seg0");
    expect(a).toBe(b);
  });

  it("folds every identity field into the key — no field is silently dropped", () => {
    const key = buildSpeechCacheKey(identity({ documentId: "doc-x", pageNumber: 7, pageTruthKey: "doc-x::7::t", owner: "study-speech", lessonId: "L1" }), "local-id");
    expect(key).toContain("doc-x");
    expect(key).toContain("7");
    expect(key).toContain("study-speech");
    expect(key).toContain("L1");
    expect(key).toContain("local-id");
  });
});

describe("buildSpeechSessionKey / speechSessionIdentitiesEqual", () => {
  it("two identities differing only in lessonId are NOT equal", () => {
    const a = identity({ lessonId: "L1" });
    const b = identity({ lessonId: "L2" });
    expect(speechSessionIdentitiesEqual(a, b)).toBe(false);
  });

  it("two structurally identical identities ARE equal", () => {
    expect(speechSessionIdentitiesEqual(identity(), identity())).toBe(true);
  });

  it("null/undefined identities are only equal to themselves", () => {
    expect(speechSessionIdentitiesEqual(null, null)).toBe(true);
    expect(speechSessionIdentitiesEqual(null, identity())).toBe(false);
    expect(speechSessionIdentitiesEqual(undefined, undefined)).toBe(true);
  });

  it("an identity with no lessonId still produces a stable, distinct key from one that has one", () => {
    const withoutLesson = buildSpeechSessionKey(identity());
    const withLesson = buildSpeechSessionKey(identity({ lessonId: "L1" }));
    expect(withoutLesson).not.toBe(withLesson);
  });
});
