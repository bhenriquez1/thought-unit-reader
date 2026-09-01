// tests/apex/testLabRetryAndWriteRace.test.ts
// P1 Launch-Blocker Remediation L3 — an audit into the TestLab source
// binding fix (PR #745) found two real, confirmed causes for "TestLab
// received a valid hashed sourceDocumentId, but displayed 'Add a source
// in Avrrio Reader first'":
//
// 1. pages/index.tsx's guest/local upload branches wrote the durable
//    'avrrio-local-library' localStorage catalog entry only AFTER the
//    (slower, can take real time for a large PDF) IndexedDB blob write
//    resolved. Navigating away before that promise chain resolved — e.g.
//    clicking "TestLab," which forces a hard cross-router reload across
//    the pages/app-router boundary — tore the chain down before the
//    catalog entry was ever written, so the book silently never made it
//    into the Library despite the upload having visibly "succeeded."
//
// 2. app/apex/page.tsx's catalogue load had no self-heal: if it ever
//    caught a false-empty state (from #1, or a slow Firebase auth-state
//    resolution on this fresh route), the page was stuck showing the
//    empty state until a full manual refresh, which just re-raced the
//    same causes.
//
// No jsdom/render harness for either file in this repo — source
// inspection, matching this repo's established pattern.

import fs from "fs";
import path from "path";

const INDEX_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");
const DASHBOARD_SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/page.tsx"), "utf8");

describe("pages/index.tsx — the guest/local library catalog entry is never lost to a navigation race", () => {
  it("REQUIRED: both upload fallback branches write persistLocalLibraryEntry synchronously, not chained after persistToIDB", () => {
    const matches = INDEX_SRC.match(/persistLocalLibraryEntry\(\{ id: documentId, name: file\.name, uploadedAt, localDocumentId: documentId \}\);\s*\n\s*persistToIDB\(documentId\)\s*\n\s*\.catch\(/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("REQUIRED: persistToIDB is never followed by a .then(() => persistLocalLibraryEntry(...)) chain anymore", () => {
    expect(INDEX_SRC).not.toMatch(/persistToIDB\(documentId\)\s*\n\s*\.then\(\(\) => persistLocalLibraryEntry/);
  });
});

describe("app/apex/page.tsx — a requested-but-missing source self-heals with one retry instead of a permanent empty state", () => {
  it("REQUIRED: a ref (not state) tracks whether the retry has already fired, so retrying never re-triggers the mount effect", () => {
    expect(DASHBOARD_SRC).toMatch(/const retriedForMissingSourceRef = useRef\(false\);/);
  });

  it("REQUIRED: when a specific book was requested by id but the catalogue doesn't contain it yet, loadWorkspace retries itself once and keeps the loading state through the wait", () => {
    const idx = DASHBOARD_SRC.indexOf("const requestedSpecificBook = !!(requestedDocId || requestedBookId);");
    expect(idx).toBeGreaterThan(-1);
    const block = DASHBOARD_SRC.slice(idx, idx + 700);
    expect(block).toMatch(/const requestedBookMissing =\s*\n\s*requestedSpecificBook &&\s*\n\s*!catalogue\.some\(\(b\) => b\.documentId === requestedDocId \|\| b\.bookId === requestedBookId\);/);
    expect(block).toMatch(/if \(requestedBookMissing && !retriedForMissingSourceRef\.current\) \{/);
    expect(block).toMatch(/retriedForMissingSourceRef\.current = true;/);
    expect(block).toMatch(/setTimeout\(\(\) => \{ void loadWorkspace\(\); \}, 1200\);/);
    expect(block).toMatch(/return; \/\/ keep the "Loading…" state through the retry/);
  });

  it("REQUIRED: a genuinely empty catalogue (no requested book) never retries — books/booksLoading resolve normally", () => {
    // The retry branch is gated on requestedBookMissing, which itself
    // requires requestedSpecificBook — a plain empty Library with no
    // query param can never satisfy that condition, so it always falls
    // through to the normal setBooks/setBooksLoading(false) path below.
    const idx = DASHBOARD_SRC.indexOf("setBooks(catalogue);");
    expect(idx).toBeGreaterThan(-1);
    const retryIdx = DASHBOARD_SRC.indexOf("if (requestedBookMissing && !retriedForMissingSourceRef.current)");
    expect(retryIdx).toBeGreaterThan(-1);
    expect(retryIdx).toBeLessThan(idx); // the retry check happens before books/loading ever resolve
  });
});
