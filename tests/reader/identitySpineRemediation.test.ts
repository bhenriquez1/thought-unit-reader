// tests/reader/identitySpineRemediation.test.ts
// P1 Launch-Blocker Remediation — "the entire Avrrio learning ecosystem
// must use the same persistent identity." An audit (against commit
// 9f6e061) found two real, confirmed bugs behind the reported symptoms:
//
// 1. resolvedDocumentId — the canonical Library documentId every
//    downstream module (TestLab, recordLearningEvent, Recall, etc.) is
//    supposed to key on — silently fell back to a hash of the Firebase
//    Storage download URL instead of the real Firestore documentId for
//    ANY book opened via a successful Firebase upload or reopened from
//    the Library drawer. Only local/guest uploads ever set the field
//    (currentLocalDocumentId) resolvedDocumentId read from. This is the
//    root cause most likely behind the broader "identity fragmentation"
//    complaint — a Firebase-sourced book's resolvedDocumentId could never
//    match that same book's real documentId anywhere the Library itself
//    is consulted (e.g. TestLab's ?sourceDocumentId= matching).
//
// 2. The "My Library" drawer's populating effect was keyed on
//    [user, showLibrary], so a GUEST simply opening the drawer re-ran the
//    "signed out" branch and wiped pdfLibrary to [] — even with a real
//    PDF already open in Reader. Reproduces "Reader has a valid PDF open,
//    Library says No PDFs yet" exactly.
//
// No jsdom/render harness for pages/index.tsx in this repo — source
// inspection, matching this repo's established pattern for this file.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("canonicalDocumentId — the real Library documentId, set on every real 'open a book' path", () => {
  it("is declared as its own state, distinct from currentLocalDocumentId (which gates the IDB-blob retry button)", () => {
    expect(SRC).toMatch(/const \[canonicalDocumentId, setCanonicalDocumentId\] = useState<string \| null>\(null\);/);
  });

  it("REQUIRED: a successful Firebase upload sets it to the real Firestore documentId (stableDocumentId)", () => {
    const idx = SRC.indexOf("url = await uploadPDF(file, USER_ID);");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 500);
    expect(block).toMatch(/setCanonicalDocumentId\(stableDocumentId\);/);
  });

  it("REQUIRED: both local/guest upload fallback branches also set it (same value as currentLocalDocumentId there)", () => {
    const matches = SRC.match(/setCurrentLocalDocumentId\(documentId\);\s*\n\s*setCanonicalDocumentId\(documentId\);/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("REQUIRED: handleLoadPDF accepts a 4th documentId param and sets canonicalDocumentId on both its local and Firebase branches", () => {
    const idx = SRC.indexOf("const handleLoadPDF = useCallback(async (url: string, name?: string, localDocumentId?: string, documentId?: string) => {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 2500);
    expect(block).toMatch(/setCanonicalDocumentId\(documentId \?\? localDocumentId\);/);
    expect(block).toMatch(/setCurrentLocalDocumentId\(null\);\s*\n\s*setCanonicalDocumentId\(documentId \?\? null\);/);
  });

  it("REQUIRED: every handleLoadPDF/handleLoadPDFRef call site sourced from the Library passes the real documentId (pdf.id / match.id)", () => {
    expect(SRC).toMatch(/handleLoadPDF\(pdf\.url, pdf\.name, pdf\.localDocumentId, pdf\.id\)/);
    expect(SRC).toMatch(/handleLoadPDFRef\.current\?\.\(match\.url, match\.name, match\.localDocumentId, match\.id\);/);
  });

  it("REQUIRED: the mount-time local-document restore path also sets canonicalDocumentId", () => {
    const idx = SRC.indexOf("setCurrentLocalDocumentId(restored.currentLocalDocumentId);");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 150);
    expect(block).toMatch(/setCanonicalDocumentId\(restored\.currentLocalDocumentId\);/);
  });

  it("REQUIRED: resolvedDocumentId prefers canonicalDocumentId over currentLocalDocumentId", () => {
    expect(SRC).toMatch(/resolveDocumentIdentity\(\{ documentId: canonicalDocumentId \?\? currentLocalDocumentId, fileUrl, bookId \}\)/);
  });
});

describe("startBookProcessing's canonicalDocumentId argument — a successful Firebase upload must stamp CanonicalThoughtUnits with the same id Knowledge Graph nodes/TestLab use", () => {
  // Bug found by automated review on PR #748 (merged), verified real: this
  // call site used to re-derive its 4th argument via
  // resolveDocumentIdentity({ documentId: libEntry.localDocumentId, fileUrl: url, bookId: documentId }).
  // libEntry.localDocumentId is only ever set on the two local/guest upload
  // fallback branches — a SUCCESSFUL Firebase upload's libEntry never sets
  // it, so that expression silently fell through to a hash of the Storage
  // download URL instead of stableDocumentId. Every CanonicalThoughtUnit
  // created during processing then carried a DIFFERENT identity than the
  // Knowledge Graph nodes and TestLab's exam builder, both of which key off
  // the real stableDocumentId (canonicalDocumentId React state) — losing
  // grounded question content for every signed-in user's successful upload,
  // the most common path.
  it("REQUIRED: startBookProcessing's 4th argument is documentId itself (already === stableDocumentId for every upload branch), not a re-derived resolveDocumentIdentity(...) call reading libEntry.localDocumentId", () => {
    const callIdx = SRC.indexOf("startBookProcessing(file, documentId, 1, documentId);");
    expect(callIdx).toBeGreaterThan(-1);
    const declIdx = SRC.indexOf("const documentId = stableDocumentId;");
    expect(declIdx).toBeGreaterThan(-1);
    expect(declIdx).toBeLessThan(callIdx);
    // The old broken expression is only quoted inside this fix's own
    // explanatory comment now (for context) — never as an argument to a
    // real startBookProcessing(...) call.
    expect(SRC).not.toMatch(/startBookProcessing\([^)]*resolveDocumentIdentity/);
  });
});

describe("Library drawer no longer wipes itself when a guest simply opens it", () => {
  it("REQUIRED: the clear-on-sign-out effect is keyed only on [user], not [user, showLibrary]", () => {
    const idx = SRC.indexOf("if (firebaseConnected && user) {\n      getPDFLibrary(USER_ID).then(setPdfLibrary);\n    } else {\n      setPdfLibrary([]);");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 250);
    expect(block).toMatch(/\}, \[user\]\);/);
  });

  it("REQUIRED: a separate effect refreshes the Firestore library when the drawer opens, but ONLY for a signed-in user — it never clears anything for a guest", () => {
    const idx = SRC.indexOf("if (firebaseConnected && user && showLibrary) {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 200);
    expect(block).toMatch(/getPDFLibrary\(USER_ID\)\.then\(setPdfLibrary\);/);
    expect(block).not.toMatch(/setPdfLibrary\(\[\]\)/);
  });
});
