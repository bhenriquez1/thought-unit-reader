// tests/canonical/surgeonAnnotationPlanStore.test.ts
// Static-analysis regression guard for lib/canonical/surgeonAnnotationPlanStore.ts.
//
// This codebase's jest config runs testEnvironment:"node" with no IndexedDB
// polyfill (no fake-indexeddb dependency, no global indexedDB mock in
// tests/setup.ts) — and lib/canonical/store.ts, the reference pattern this file
// is modeled on, itself has zero live-IDB test coverage in this repo. Rather than
// add a new test dependency, this follows the same fs.readFileSync + regex
// static-analysis pattern already used elsewhere in this session (e.g.
// tests/api/upstreamHardening.test.ts) to guard the store's shape and API surface.

import fs from "fs";
import path from "path";

const STORE_FILE = path.resolve(__dirname, "../../lib/canonical/surgeonAnnotationPlanStore.ts");

describe("lib/canonical/surgeonAnnotationPlanStore.ts — IDB persistence shape", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(STORE_FILE, "utf8"); });

  it("uses a dedicated DB/store name, modeled on lib/canonical/store.ts's pattern", () => {
    expect(src).toMatch(/DB_NAME\s*=\s*'avrrio_surgeon_plans_v1'/);
    expect(src).toMatch(/STORE_NAME\s*=\s*'surgeon_plans_v1'/);
  });

  it("keys the store by the versioned cacheKey, not a synthetic id", () => {
    expect(src).toMatch(/keyPath:\s*'cacheKey'/);
  });

  it("has a byBookPage secondary index for page-scoped pruning", () => {
    expect(src).toMatch(/createIndex\('byBookPage',\s*\['bookId',\s*'pageIndex'\]\)/);
  });

  it("exports the full CRUD surface: save, get, list-by-page, delete-by-document", () => {
    expect(src).toMatch(/export async function saveSurgeonAnnotationPlan/);
    expect(src).toMatch(/export async function getSurgeonAnnotationPlan\(/);
    expect(src).toMatch(/export async function getSurgeonAnnotationPlansByPage/);
    expect(src).toMatch(/export async function deleteSurgeonAnnotationPlansByDocument/);
  });

  it("openDB() rejects cleanly when indexedDB is unavailable, matching lib/canonical/store.ts", () => {
    expect(src).toMatch(/typeof indexedDB === 'undefined'/);
    expect(src).toMatch(/reject\(new Error\('IDB unavailable'\)\)/);
  });

  it("save() stamps createdAt so stored plans can be aged/pruned later", () => {
    expect(src).toMatch(/createdAt:\s*Date\.now\(\)/);
  });

  it("imports SurgeonAnnotationPlan from the Phase 1 schema file, not the old PageAnnotationPlan shape", () => {
    expect(src).toMatch(/import type \{ SurgeonAnnotationPlan \} from '\.\.\/insights\/pageAnnotationPlan'/);
  });
});
