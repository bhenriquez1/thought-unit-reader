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
