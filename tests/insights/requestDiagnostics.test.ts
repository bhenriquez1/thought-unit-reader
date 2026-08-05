// tests/insights/requestDiagnostics.test.ts
import { hashDocumentId, newRequestId } from "../../lib/insights/requestDiagnostics";

describe("hashDocumentId", () => {
  it("is deterministic — same documentId always produces the same hash", () => {
    expect(hashDocumentId("book-123")).toBe(hashDocumentId("book-123"));
  });

  it("differs for different documentIds", () => {
    expect(hashDocumentId("book-123")).not.toBe(hashDocumentId("book-456"));
  });

  it("never returns the raw documentId — the input text is not recoverable from the output", () => {
    const raw = "gross-anatomy-textbook-2024.pdf";
    expect(hashDocumentId(raw)).not.toContain(raw);
  });

  it("is prefixed so log readers can identify the field's shape", () => {
    expect(hashDocumentId("x")).toMatch(/^doc_[0-9a-f]{8}$/);
  });

  it("REQUIRED: does not iterate an unbounded/attacker-controlled input length — an extremely long documentId still returns quickly and deterministically", () => {
    // documentId is a request-body value with no length limit enforced by this
    // module — CodeQL flagged the un-capped `for (i < str.length)` loop as a
    // loop-bound-injection risk. The hash must cap how much it reads.
    const huge = "x".repeat(50_000_000);
    const started = Date.now();
    const result = hashDocumentId(huge);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result).toMatch(/^doc_[0-9a-f]{8}$/);
    // Two inputs that only differ after the cap must hash identically —
    // direct proof the loop bound is capped, not merely fast.
    expect(hashDocumentId(huge)).toBe(hashDocumentId(huge + "extra-tail-that-must-be-ignored"));
  });
});

describe("newRequestId", () => {
  it("returns a string prefixed for log readability", () => {
    expect(newRequestId()).toMatch(/^req_/);
  });

  it("produces distinct ids on successive calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newRequestId()));
    expect(ids.size).toBe(20);
  });
});
