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

  it("allows PDF Storage access only beneath the signed-in user's UID", () => {
    const rules = read("storage.rules");
    expect(rules).toMatch(/match \/pdfs\/\{uid\}\/\{objectPath=\*\*\}/);
    expect(rules).toMatch(/request\.auth != null && request\.auth\.uid == uid/);
    expect(rules).not.toMatch(/allow\s+(?:read|write|read,\s*write)\s*:\s*if\s+true/);
    expect(rules).not.toMatch(/match \/\{allPaths=\*\*\}/);
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

  it("starts with a valid empty Firestore indexes manifest", () => {
    const indexes = JSON.parse(read("firestore.indexes.json"));
    expect(indexes).toEqual({ indexes: [], fieldOverrides: [] });
  });
});
