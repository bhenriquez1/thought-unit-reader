// tests/canonical/canonicalUnitsCloudSync.test.ts
// L14 (approved by Brian) — CanonicalThoughtUnits previously lived ONLY in
// browser-local IndexedDB (lib/canonical/store.ts), never synced to
// Firebase. That meant NoteLab's AI notebook synthesis (grounded by
// getCanonicalUnitsByPage) silently found zero units — and produced no
// visual note at all — on any device/session other than the one that
// originally processed a given book (see the L13 audit this fix follows
// up on). This mirrors units to Firestore under the existing
// users/{uid}/{document=**} catch-all rule, with IndexedDB kept as the
// fast local cache.
//
// No jsdom/IDB harness in this repo's jest config (testEnvironment: "node")
// — source inspection, matching tests/firebase/durablePersistenceContract.test.ts's
// own convention for this exact kind of cross-file wiring check.

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

const STORE_SRC = read("lib/canonical/store.ts");
const DURABLE_SRC = read("lib/firebase/durableState.ts");
const RULES_SRC = read("firestore.rules");
const INDEXES_SRC = read("firestore.indexes.json");

describe("lib/firebase/durableState.ts — canonicalUnits cloud record (L14)", () => {
  it("REQUIRED: saveCanonicalUnitsPage/loadCanonicalUnitsPage exist and use the users/{uid}/canonicalUnits/{documentId}/pages/{pageIndex} path", () => {
    expect(DURABLE_SRC).toMatch(/export async function loadCanonicalUnitsPage\(documentId: string, pageIndex: number\): Promise<unknown\[\] \| null>/);
    expect(DURABLE_SRC).toMatch(/export async function saveCanonicalUnitsPage\(documentId: string, pageIndex: number, units: unknown\[\]\): Promise<void>/);
    expect(DURABLE_SRC).toMatch(/doc\(db, "users", uid, "canonicalUnits", documentId, "pages", String\(pageIndex\)\)/);
  });

  it("REQUIRED: both are gated through requireServices() — same sign-in/db-availability guard as every other durable write in this file", () => {
    const loadIdx = DURABLE_SRC.indexOf("export async function loadCanonicalUnitsPage");
    const loadBlock = DURABLE_SRC.slice(loadIdx, loadIdx + 500);
    expect(loadBlock).toMatch(/const \{ uid, db \} = requireServices\(\);/);

    const saveIdx = DURABLE_SRC.indexOf("export async function saveCanonicalUnitsPage");
    const saveBlock = DURABLE_SRC.slice(saveIdx, saveIdx + 500);
    expect(saveBlock).toMatch(/const \{ uid, db \} = requireServices\(\);/);
  });

  it("REQUIRED: failures are logged via the existing privacy-safe logPersistenceFailure helper, never console.log of raw content", () => {
    const loadIdx = DURABLE_SRC.indexOf("export async function loadCanonicalUnitsPage");
    const saveEndIdx = DURABLE_SRC.indexOf("export async function saveOwnedRecord");
    const block = DURABLE_SRC.slice(loadIdx, saveEndIdx);
    expect(block).toMatch(/logPersistenceFailure\("get", path, error\)/);
    expect(block).toMatch(/logPersistenceFailure\("set", path, error\)/);
  });

  it("REQUIRED: saveCanonicalUnitsPage strips undefined fields via the existing withoutUndefined helper, same as every other durable write", () => {
    const saveIdx = DURABLE_SRC.indexOf("export async function saveCanonicalUnitsPage");
    const saveBlock = DURABLE_SRC.slice(saveIdx, saveIdx + 500);
    expect(saveBlock).toMatch(/units: withoutUndefined\(units\)/);
  });
});

describe("lib/canonical/store.ts — cloud mirror wiring (L14)", () => {
  it("REQUIRED: imports saveCanonicalUnitsPage/loadCanonicalUnitsPage from the shared durable-state module", () => {
    expect(STORE_SRC).toMatch(/import \{ saveCanonicalUnitsPage, loadCanonicalUnitsPage \} from '@\/lib\/firebase\/durableState';/);
  });

  it("REQUIRED: saveCanonicalUnit and saveCanonicalUnits both fire syncCanonicalUnitsToCloud without awaiting it — cloud sync never slows down the local IDB write callers depend on", () => {
    const singleIdx = STORE_SRC.indexOf("export async function saveCanonicalUnit(");
    const singleBlock = STORE_SRC.slice(singleIdx, STORE_SRC.indexOf("}", singleIdx));
    expect(singleBlock).toMatch(/void syncCanonicalUnitsToCloud\(\[unit\]\);/);

    const manyIdx = STORE_SRC.indexOf("export async function saveCanonicalUnits(");
    const manyBlock = STORE_SRC.slice(manyIdx, STORE_SRC.indexOf("}", manyIdx));
    expect(manyBlock).toMatch(/void syncCanonicalUnitsToCloud\(units\);/);
  });

  it("REQUIRED: syncCanonicalUnitsToCloud groups by (documentId, pageIndex), never as one write per unit — matches the small (~2-5 units/page) per-page write pattern the cloud record is designed for", () => {
    const idx = STORE_SRC.indexOf("async function syncCanonicalUnitsToCloud");
    const block = STORE_SRC.slice(idx, STORE_SRC.indexOf("\n}\n", idx));
    expect(block).toMatch(/const groups = new Map</);
    expect(block).toMatch(/documentId: u\.documentId, pageIndex: u\.pageIndex/);
  });

  it("REQUIRED: each page group is READ-merge-written (loadCanonicalUnitsPage before saveCanonicalUnitsPage), never a blind overwrite — otherwise a single-unit save (linkQuestionToUnit) would silently wipe every sibling unit already mirrored for that page", () => {
    const idx = STORE_SRC.indexOf("async function syncCanonicalUnitsToCloud");
    const block = STORE_SRC.slice(idx, STORE_SRC.indexOf("\n}\n", idx));
    const loadIdx = block.indexOf("loadCanonicalUnitsPage(");
    const saveIdx = block.indexOf("saveCanonicalUnitsPage(");
    expect(loadIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(loadIdx);
    // merges the freshly-saved units INTO the existing set by id, not replacing it outright
    expect(block).toMatch(/const byId = new Map<string, CanonicalThoughtUnit>\(/);
    expect(block).toMatch(/for \(const u of group\.units\) byId\.set\(u\.id, u\);/);
    expect(block).toMatch(/saveCanonicalUnitsPage\(group\.documentId, group\.pageIndex, Array\.from\(byId\.values\(\)\)\)/);
  });

  it("REQUIRED: a cloud sync failure is caught and logged, never thrown into the caller — saveCanonicalUnits/saveCanonicalUnit must never fail because Firestore is unreachable", () => {
    const idx = STORE_SRC.indexOf("async function syncCanonicalUnitsToCloud");
    const block = STORE_SRC.slice(idx, STORE_SRC.indexOf("\n}\n", idx));
    expect(block).toMatch(/catch \(err\) \{/);
    expect(block).toMatch(/console\.error\('\[CANONICAL_UNITS_CLOUD_SYNC_ERROR\]'/);
  });

  it("REQUIRED: getCanonicalUnitsByPage checks IndexedDB first, and only consults the cloud when the local result is empty — a fast, already-populated local cache is never overridden by a network round-trip", () => {
    const idx = STORE_SRC.indexOf("export async function getCanonicalUnitsByPage(");
    const block = STORE_SRC.slice(idx, STORE_SRC.indexOf("\n}\n", idx));
    expect(block).toMatch(/const local = await getCanonicalUnitsByPageLocal\(documentId, pageIndex\);/);
    expect(block).toMatch(/if \(local\.length > 0\) return local;/);
  });

  it("REQUIRED: a cloud-fallback hit backfills IndexedDB via putUnitsLocal, never re-uploads what it just downloaded (which would call syncCanonicalUnitsToCloud again)", () => {
    const idx = STORE_SRC.indexOf("export async function getCanonicalUnitsByPage(");
    const block = STORE_SRC.slice(idx, STORE_SRC.indexOf("\n}\n", idx));
    expect(block).toMatch(/await putUnitsLocal\(units\);/);
    expect(block).not.toMatch(/syncCanonicalUnitsToCloud/);
  });

  it("REQUIRED: a cloud-fallback failure is caught and logged, and the function still returns the (empty) local result rather than throwing — a signed-out user or offline browser must see the exact same 'zero units' behavior as before this phase, not a crash", () => {
    const idx = STORE_SRC.indexOf("export async function getCanonicalUnitsByPage(");
    const block = STORE_SRC.slice(idx, STORE_SRC.indexOf("\n}\n", idx));
    expect(block).toMatch(/catch \(err\) \{/);
    expect(block).toMatch(/console\.error\('\[CANONICAL_UNITS_CLOUD_FALLBACK_ERROR\]'/);
    expect(block).toMatch(/return local;\s*$/);
  });
});

describe("Firestore rules/indexes — L14 needs zero changes to either (verifying the approved plan held)", () => {
  it("REQUIRED: the existing users/{uid}/{document=**} catch-all already covers the new canonicalUnits collection — no new match block was added for it", () => {
    expect(RULES_SRC).toMatch(/match \/users\/\{uid\}\/\{document=\*\*\}/);
    expect(RULES_SRC).not.toContain("canonicalUnits");
  });

  it("REQUIRED: no new composite index was added — canonicalUnits is read/written by direct document path (doc(...)), never a filtered query, so none is needed", () => {
    expect(INDEXES_SRC).not.toContain("canonicalUnits");
  });
});
