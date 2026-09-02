import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("Firebase security configuration contract", () => {
  it("keeps Firestore user data scoped to the authenticated UID", () => {
    const rules = read("firestore.rules");
    expect(rules).toMatch(/request\.auth != null/);
    expect(rules).toMatch(/request\.auth\.uid == uid/);
    expect(rules).toMatch(/match \/users\/\{uid\}\/\{document=\*\*\}/);
    expect(rules).not.toMatch(/allow\s+(?:read|write|read,\s*write)\s*:\s*if\s+true/);
  });

  it("allows canonical Library Storage access only beneath the signed-in user's UID", () => {
    const rules = read("storage.rules");
    expect(rules).toMatch(/match \/users\/\{uid\}\/library\/\{documentId\}\/\{objectName\}/);
    expect(rules).toMatch(/request\.resource\.contentType == "application\/pdf"/);
    expect(rules).toMatch(/request\.resource\.size <= 250 \* 1024 \* 1024/);
    expect(rules).toMatch(/match \/pdfs\/\{uid\}\/\{objectPath=\*\*\}/);
    expect(rules).toMatch(/request\.auth != null && request\.auth\.uid == uid/);
    expect(rules).not.toMatch(/allow\s+(?:read|write|read,\s*write)\s*:\s*if\s+true/);
    expect(rules).not.toMatch(/match \/\{allPaths=\*\*\}/);
  });

  it("REQUIRED (L7): the legacy /pdfs/{uid}/** path caps write size the same as the canonical path — it used to have no cap at all, an unbounded storage-cost surface", () => {
    const rules = read("storage.rules");
    const idx = rules.indexOf("match /pdfs/{uid}/{objectPath=**} {");
    expect(idx).toBeGreaterThan(-1);
    const block = rules.slice(idx, idx + 300);
    expect(block).toMatch(/allow read, delete: if isSelf\(uid\);/);
    expect(block).toMatch(/allow create, update: if isSelf\(uid\) && request\.resource\.size <= 250 \* 1024 \* 1024;/);
    expect(block).not.toMatch(/allow read, write: if isSelf\(uid\);/);
  });

  it("version-controls every rules and indexes file referenced by firebase.json", () => {
    const config = JSON.parse(read("firebase.json"));
    expect(config.firestore.rules).toBe("firestore.rules");
    expect(config.firestore.indexes).toBe("firestore.indexes.json");
    expect(config.storage.rules).toBe("storage.rules");
    for (const file of [config.firestore.rules, config.firestore.indexes, config.storage.rules]) {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }
  });

  it("ships the composite indexes required by durable learning queries", () => {
    const indexes = JSON.parse(read("firestore.indexes.json"));
    expect(indexes.fieldOverrides).toEqual([]);
    expect(indexes.indexes.map((index: { collectionGroup: string }) => index.collectionGroup))
      .toEqual(expect.arrayContaining(["library", "stickyNotes", "recall", "learningState"]));
  });

  it("names every canonical durable user-owned path explicitly", () => {
    const rules = read("firestore.rules");
    for (const area of ["library", "notebooks", "stickyNotes", "learningState", "recall", "tests", "children"]) {
      expect(rules).toContain(`/users/{uid}/${area}`);
    }
  });
});
