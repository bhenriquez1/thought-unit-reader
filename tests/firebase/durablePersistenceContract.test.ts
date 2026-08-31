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

  it("logs permission diagnostics without content, credentials, email, or raw UID", () => {
    const source = read("lib/firebase/durableState.ts");
    expect(source).toContain("[FIREBASE_PERSISTENCE_ERROR]");
    expect(source).toContain("users/[current-user]/notebooks/");
    expect(source).toContain("code: firebaseErrorCode(error)");
    const diagnosticCall = source.slice(source.indexOf('console.error("[FIREBASE_PERSISTENCE_ERROR]"'), source.indexOf("export function currentFirebaseUid"));
    expect(diagnosticCall).not.toMatch(/\b(value|payload|content|firebaseConfig|email|token|uid:)\b/);
  });

  it("gates Save to NoteLab until Firebase auth restoration resolves", () => {
    const source = read("components/reader/RightPanel.tsx");
    expect(source).toContain("const { user: firebaseUser, loading: authLoading } = useAuthUser();");
    expect(source).toContain("const authenticated = !authLoading && !!firebaseUser;");
    expect(source).toContain("disabled={!synthReady || !authenticated || saving}");
    expect(source).toContain("Restoring sign-in…");
    expect(source).toContain("Sign in to save to NoteLab");
  });

  it("keeps every durable feature on the single users/{uid} contract", () => {
    const durable = read("lib/firebase/durableState.ts");
    const rules = read("firestore.rules");
    for (const area of ["library", "notebooks", "stickyNotes", "learningState", "recall", "tests"]) {
      expect(rules).toContain(`/users/{uid}/${area}`);
    }
    expect(durable).toContain('doc(db, "users", uid, area, id)');
    expect(rules).not.toMatch(/allow\s+(?:read|write|read,\s*write)\s*:\s*if\s+true/);
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
