// tests/insights/fnv1a.test.ts
// Regression coverage for the RC5 fix from the Thought Unit Engine identity
// audit: three independent hash implementations existed for conceptually
// related "detect content change" purposes — lib/insights/requestDiagnostics.ts's
// fnv1a (length-capped), an identical copy-paste inside pageContentHash.ts
// (missing the cap), and a completely different base-31 polynomial rolling
// hash inside lib/useActivePageIntelligence.ts's hashText. All three now
// share the ONE implementation in requestDiagnostics.ts.

import fs from "fs";
import path from "path";
import { fnv1a, hashDocumentId } from "../../lib/insights/requestDiagnostics";
import { computePageContentHash } from "../../lib/insights/pageContentHash";

describe("fnv1a", () => {
  it("is deterministic", () => {
    expect(fnv1a("hello world")).toBe(fnv1a("hello world"));
  });

  it("different inputs produce different hashes", () => {
    expect(fnv1a("page one")).not.toBe(fnv1a("page two"));
  });

  it("defaults to hashing the FULL string — no silent truncation for a correctness-sensitive caller", () => {
    const long = "a".repeat(5000) + "DIFFERS-AT-THE-END";
    const longButDifferentTail = "a".repeat(5000) + "DIFFERS-DIFFERENTLY";
    // If this silently truncated at 2048 (requestDiagnostics.ts's own
    // logging-safety cap), both strings would hash identically since they're
    // only distinguishable well past that point.
    expect(fnv1a(long)).not.toBe(fnv1a(longButDifferentTail));
  });

  it("REQUIRED: an explicit maxLength truncates, for callers that need a bound (e.g. hashDocumentId's log-safety guard)", () => {
    const a = "x".repeat(10) + "TAIL-A";
    const b = "x".repeat(10) + "TAIL-B";
    // Both truncated to the first 10 chars (identical prefix) hash the same.
    expect(fnv1a(a, 10)).toBe(fnv1a(b, 10));
    // Untruncated, they differ.
    expect(fnv1a(a)).not.toBe(fnv1a(b));
  });
});

describe("hashDocumentId — built on the shared fnv1a, with its own length cap applied explicitly", () => {
  it("is deterministic", () => {
    expect(hashDocumentId("my-book")).toBe(hashDocumentId("my-book"));
  });

  it("is prefixed with doc_", () => {
    expect(hashDocumentId("my-book")).toMatch(/^doc_/);
  });
});

describe("computePageContentHash — reuses the shared fnv1a, not a local copy", () => {
  it("REQUIRED: pageContentHash.ts imports fnv1a from requestDiagnostics.ts rather than reimplementing it", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../lib/insights/pageContentHash.ts"), "utf8");
    expect(src).toMatch(/import \{ fnv1a \} from "\.\/requestDiagnostics"/);
    // The old local implementation must be gone, not just shadowed.
    expect(src).not.toMatch(/0x811c9dc5/);
  });

  it("is not silently truncated for long page text — a difference past 2048 chars is still detected", () => {
    const base = "word ".repeat(500); // ~2500 chars
    const a = base + "ENDING-ONE";
    const b = base + "ENDING-TWO";
    expect(computePageContentHash("doc-1", 1, a)).not.toBe(computePageContentHash("doc-1", 1, b));
  });

  it("remains deterministic and page/document-sensitive", () => {
    expect(computePageContentHash("doc-1", 1, "text")).toBe(computePageContentHash("doc-1", 1, "text"));
    expect(computePageContentHash("doc-1", 1, "text")).not.toBe(computePageContentHash("doc-2", 1, "text"));
    expect(computePageContentHash("doc-1", 1, "text")).not.toBe(computePageContentHash("doc-1", 2, "text"));
  });
});

describe("lib/useActivePageIntelligence.ts — textHash uses the shared fnv1a, not a locally-reimplemented base-31 polynomial hash", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(path.resolve(__dirname, "../../lib/useActivePageIntelligence.ts"), "utf8"); });

  it("REQUIRED: imports fnv1a and uses it to build textHash", () => {
    expect(src).toMatch(/import \{ fnv1a \} from "@\/lib\/insights\/requestDiagnostics"/);
    expect(src).toMatch(/const textHash = fnv1a\(textForHash\);/);
  });

  it("the old locally-defined hashText function is gone", () => {
    expect(src).not.toMatch(/function hashText/);
    expect(src).not.toMatch(/hash \* 31 \+ text\.charCodeAt/);
  });
});
