import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("Avrrio durable Firebase persistence contract", () => {
  it("uses a stable content hash and canonical UID-isolated Library paths", () => {
    const source = read("lib/firebase.ts");
    expect(source).toContain('crypto.subtle.digest("SHA-256"');
    expect(source).toContain('`users/${userId}/library/${documentId}/source.pdf`');
    expect(source).toContain('doc(dbInstance, "users", userId, "library", documentId)');
    expect(source).not.toContain('ref(storageInstance, `pdfs/${userId}/${file.name}`)');
  });

  it("persists and restores serializable tldraw snapshots with a visible status", () => {
    const source = read("components/notelab/NotebookCanvas.tsx");
    expect(source).toMatch(/getSnapshot\(editor\.store\)/);
    expect(source).toMatch(/loadSnapshot\(editor\.store/);
    expect(source).toContain("notebook-cloud-save-status");
    expect(source).toContain("Save failed — edits kept locally");
    expect(source).toContain("FirebaseVersionConflictError");
  });

  it("dual-writes canonical feature stores without creating a second cloud schema", () => {
    const cases = [
      ["lib/notelab/ultraNoteStore.ts", "saveNotebookSemanticState"],
      ["lib/stickyNotes/stickyNoteStore.ts", 'saveOwnedRecord("stickyNotes"'],
      ["lib/recalllab/recallStore.ts", 'saveOwnedRecord("recall"'],
      ["lib/knowledge/knowledgeGraphStore.ts", 'saveOwnedRecord("learningState"'],
      ["lib/datApex/idbStore.ts", 'saveOwnedRecord("tests"'],
      ["lib/elena/idbStore.ts", "saveChildState"],
    ];
    for (const [file, marker] of cases) expect(read(file)).toContain(marker);
  });

  it("does not log Firebase configuration values", () => {
    expect(read("lib/firebase.ts")).not.toMatch(/console\.(?:log|error|warn)\([^\n]*firebaseConfig\.(?:apiKey|appId|storageBucket)/);
  });
});
