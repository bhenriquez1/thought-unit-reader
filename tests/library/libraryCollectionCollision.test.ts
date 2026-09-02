// tests/library/libraryCollectionCollision.test.ts
// L7 (Learning Hub orchestration correction) — lib/libraryService.ts and
// lib/firebase.ts's uploadPDF/getPDFLibrary/deletePDF used to target the
// exact same Firestore collection (users/{uid}/library). libraryService.ts
// has never had a live writer (its one consumer, components/LibraryPanel.tsx,
// is imported but never rendered), so this is a going-forward rename with
// no production data to migrate — locks in that the rename actually
// happened and that the live PDF drawer's own path is untouched.

import fs from "fs";
import path from "path";

const LIBRARY_SERVICE_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/libraryService.ts"), "utf8");
const FIREBASE_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/firebase.ts"), "utf8");

describe("lib/libraryService.ts no longer collides with the live PDF library collection", () => {
  it("REQUIRED: targets a distinct collection name, not users/${userId}/library", () => {
    expect(LIBRARY_SERVICE_SRC).toMatch(/collection\(db, `users\/\$\{userId\}\/libraryNotes`\)/);
    expect(LIBRARY_SERVICE_SRC).not.toMatch(/collection\(db, `users\/\$\{userId\}\/library`\)/);
  });
});

describe("lib/firebase.ts — the live PDF drawer's own collection path is unchanged", () => {
  it("uploadPDF/getPDFLibrary/deletePDF still target users/{uid}/library", () => {
    expect(FIREBASE_SRC).toMatch(/doc\(dbInstance, "users", userId, "library", documentId\)/);
    expect(FIREBASE_SRC).toMatch(/collection\(dbInstance, "users", userId, "library"\)/);
  });
});
