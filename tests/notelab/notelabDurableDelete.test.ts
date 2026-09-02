// tests/notelab/notelabDurableDelete.test.ts
// P1 Launch-Blocker Remediation L4 — deleteUltraNote only ever removed the
// IndexedDB row and the localStorage mirror. For a signed-in user, saveUltraNote
// dual-writes every note to Firestore via saveNotebookSemanticState, and
// getAllUltraNotesAsync() unconditionally merges every Firestore notebook doc
// back into IDB/LS on each read (lib/notelab/ultraNoteStore.ts's own
// getAllUltraNotesAsync). Since delete never touched that Firestore doc, a
// "deleted" note resurrected on the very next NoteLab reload/refresh/sign-in.
//
// No jsdom/IDB test harness for this store in this repo (see
// tests/notelab/ultraNoteDocumentIdentity.test.ts, tests/notelab/
// conceptAccumulation.test.ts's own header comment) — source inspection,
// matching this repo's established pattern.

import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
}

describe("lib/firebase/durableState.ts — a notebook's cloud record can actually be deleted", () => {
  const src = read("lib/firebase/durableState.ts");

  it("REQUIRED: deleteNotebookSemanticState exists and deletes the pages subcollection before the parent doc", () => {
    const idx = src.indexOf("export async function deleteNotebookSemanticState(notebookId: string): Promise<void> {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/doc\(db, "users", uid, "notebooks", notebookId\)/);
    expect(block).toMatch(/getDocs\(collection\(notebookRef, "pages"\)\)/);
    expect(block).toMatch(/deleteDoc\(pageDoc\.ref\)/);
    expect(block).toMatch(/deleteDoc\(notebookRef\)/);
    // pages subcollection cleared before the parent doc, not after
    expect(block.indexOf("pagesSnap.docs.map")).toBeLessThan(block.indexOf("await deleteDoc(notebookRef)"));
  });

  it("REQUIRED: a failed cloud delete logs and re-throws, same as every other durable write in this file", () => {
    const idx = src.indexOf("export async function deleteNotebookSemanticState");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/logPersistenceFailure\("delete", path, error\)/);
    expect(block).toMatch(/throw error;/);
  });
});

describe("lib/notelab/ultraNoteStore.ts — deleteUltraNote is durable for signed-in users", () => {
  const src = read("lib/notelab/ultraNoteStore.ts");

  it("REQUIRED: imports deleteNotebookSemanticState alongside the existing durable-state imports", () => {
    expect(src).toMatch(/import \{ currentFirebaseUid, listNotebookSemanticStates, saveNotebookSemanticState, deleteNotebookSemanticState \} from "@\/lib\/firebase\/durableState";/);
  });

  it("REQUIRED: the cloud delete runs first, gated on currentFirebaseUid(), before any local IDB/LS removal", () => {
    const idx = src.indexOf("export async function deleteUltraNote(id: string): Promise<void> {");
    expect(idx).toBeGreaterThan(-1);
    const idbDeleteIdx = src.indexOf("await idbDeleteNote(id);", idx);
    const lsRemoveIdx = src.indexOf("lsRemove(id);", idx);
    const cloudDeleteIdx = src.indexOf("await deleteNotebookSemanticState(id);", idx);
    expect(cloudDeleteIdx).toBeGreaterThan(idx);
    expect(cloudDeleteIdx).toBeLessThan(idbDeleteIdx);
    expect(idbDeleteIdx).toBeLessThan(lsRemoveIdx);
    const block = src.slice(idx, cloudDeleteIdx);
    expect(block).toMatch(/if \(currentFirebaseUid\(\)\) \{/);
  });

  it("REQUIRED: a failed cloud delete re-throws without ever reaching the local IDB/LS removal — a deleted-locally-but-not-in-the-cloud note would just resurrect on the next getAllUltraNotesAsync() merge", () => {
    const idx = src.indexOf("export async function deleteUltraNote(id: string): Promise<void> {");
    const cloudDeleteIdx = src.indexOf("await deleteNotebookSemanticState(id);", idx);
    const idbDeleteIdx = src.indexOf("await idbDeleteNote(id);", idx);
    const catchBlock = src.slice(cloudDeleteIdx, idbDeleteIdx);
    expect(catchBlock).toMatch(/catch \(e\) \{/);
    expect(catchBlock).toMatch(/console\.error\("\[NOTELAB_CLOUD_DELETE_FAIL\]"/);
    expect(catchBlock).toMatch(/throw e;/);
  });

  it("REQUIRED: still dispatches note-lab-updated on success, same as before", () => {
    const idx = src.indexOf("export async function deleteUltraNote(id: string): Promise<void> {");
    const nextExportIdx = src.indexOf("\nexport ", idx + 10);
    const block = src.slice(idx, nextExportIdx);
    expect(block).toMatch(/window\.dispatchEvent\(new Event\("note-lab-updated"\)\);/);
  });
});
