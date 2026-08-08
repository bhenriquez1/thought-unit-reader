// lib/insights/resolveDocumentIdentity.ts
// The real, collision-resistant identity to fold into pageTruthKey and other
// per-document cache keys — fixing the root cause an architecture audit
// found: every pageTruthKey in this app was built from `bookId` (the PDF's
// filename, minus extension) standing in for `documentId`. Two different
// PDFs that happen to share a filename (a re-upload, two editions both named
// "Textbook.pdf") produced an IDENTICAL pageTruthKey and collided across
// every cache keyed on it — the annotation plan store, the professor lesson
// plan store, the content-hash integrity check, all of it.
//
// `bookId` itself is NOT being replaced — it still has a real, correct job
// (page-text cache lookups, TOC caching, DAT-subject-classification
// heuristics, all of which are legitimately CONTENT/filename-scoped and
// should keep working the same for two copies of "the same book"). This
// resolver is for the SEPARATE question "which document INSTANCE is this,"
// used only where that distinction actually matters: pageTruthKey and
// per-unit provenance.
//
// Preference order:
//   1. `documentId` — the real crypto.randomUUID() assigned when a PDF is
//      persisted to IndexedDB (lib/context/learningContext.ts's
//      `documentId` field). Stable for the life of that local library entry.
//   2. A hash of `fileUrl` — covers documents opened from a durable URL with
//      no local IDB copy (e.g. a successful Firebase upload never gets a
//      local documentId). Two different files at two different URLs never
//      collide; the same URL reloaded produces the same id.
//   3. `bookId` — last resort, only when neither of the above is available
//      (e.g. before any document has finished loading). Reproduces today's
//      collision risk, but only in a state no downstream cache should be
//      keying on real content yet.
import { hashDocumentId } from "./requestDiagnostics";

export function resolveDocumentIdentity(args: {
  documentId: string | null | undefined;
  fileUrl: string | null | undefined;
  bookId: string;
}): string {
  if (args.documentId) return args.documentId;
  if (args.fileUrl) return hashDocumentId(args.fileUrl);
  return args.bookId;
}
