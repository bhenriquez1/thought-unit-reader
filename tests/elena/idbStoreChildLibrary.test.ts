// tests/elena/idbStoreChildLibrary.test.ts
// Static-analysis coverage for the child-library object store added to
// lib/elena/idbStore.ts (E2). This repo's Node test env has no indexedDB
// global, so the CRUD functions themselves are exercised via source
// inspection — matching the existing pattern for this file's other stores.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/elena/idbStore.ts"), "utf8");

describe("lib/elena/idbStore.ts — child-library store", () => {
  it("REQUIRED: DB version bumped to 3 for the new store", () => {
    expect(SRC).toMatch(/DB_VERSION\s*=\s*3/);
  });

  it("REQUIRED: creates the child-library object store keyed by id", () => {
    const idx = SRC.indexOf('STORE_LIBRARY  = "child-library"');
    expect(idx).toBeGreaterThan(-1);
    expect(SRC).toMatch(/db\.createObjectStore\(STORE_LIBRARY, \{ keyPath: "id" \}\)/);
  });

  it("REQUIRED: has a byChild index for per-profile listing, matching the vocabulary store's pattern", () => {
    const idx = SRC.indexOf("const libraryStore = db.createObjectStore(STORE_LIBRARY");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 200);
    expect(block).toMatch(/libraryStore\.createIndex\("byChild", "childProfileId", \{ unique: false \}\)/);
  });

  it("exports saveChildLibraryEntry, listChildLibraryEntries, getChildLibraryEntry, deleteChildLibraryEntry", () => {
    expect(SRC).toMatch(/export async function saveChildLibraryEntry\(entry: ChildLibraryEntry\): Promise<void>/);
    expect(SRC).toMatch(/export async function listChildLibraryEntries\(childProfileId: string\): Promise<ChildLibraryEntry\[\]>/);
    expect(SRC).toMatch(/export async function getChildLibraryEntry\(childProfileId: string, documentId: string\): Promise<ChildLibraryEntry \| null>/);
    expect(SRC).toMatch(/export async function deleteChildLibraryEntry\(childProfileId: string, documentId: string\): Promise<void>/);
  });

  it("REQUIRED: listChildLibraryEntries reads via the byChild index, not a full-store scan filtered in JS", () => {
    const idx = SRC.indexOf("export async function listChildLibraryEntries");
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/tx\.objectStore\(STORE_LIBRARY\)\.index\("byChild"\)/);
    expect(block).toMatch(/idx\.getAll\(childProfileId\)/);
  });

  it("getChildLibraryEntry/deleteChildLibraryEntry key by the composite `${childProfileId}::${documentId}` id", () => {
    const getIdx = SRC.indexOf("export async function getChildLibraryEntry");
    expect(SRC.slice(getIdx, getIdx + 300)).toMatch(/`\$\{childProfileId\}::\$\{documentId\}`/);
    const delIdx = SRC.indexOf("export async function deleteChildLibraryEntry");
    expect(SRC.slice(delIdx, delIdx + 300)).toMatch(/`\$\{childProfileId\}::\$\{documentId\}`/);
  });
});
