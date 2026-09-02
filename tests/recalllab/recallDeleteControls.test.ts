// tests/recalllab/recallDeleteControls.test.ts
// P1 remediation L2 — "students need control over their own Recall
// material." An audit found deleteBlueprint() already existed in
// lib/recalllab/recall2Store.ts and worked correctly (IDB + localStorage
// mirror), but had zero UI wiring anywhere in the app — no delete button
// existed in either Recall generation. This wires it into the live
// Recall 2.0 dashboard (Recall2Lab.tsx's "Source-linked cards" list) and
// adds a bulk deleteBlueprints() helper for "clear all cards for this
// book," with confirmation before either destructive action.
//
// lib/recalllab/recall2Store.ts's functions go through real browser
// indexedDB (openIDB() rejects with "IDB unavailable" when indexedDB is
// undefined — this repo's jest config runs testEnvironment: "node", with
// no indexedDB polyfill), so only deleteBlueprints([])'s early-return
// guard (which never touches IDB) is exercisable as a real behavioral
// test here; the rest of the store change and all UI wiring is source
// inspection, matching this repo's established pattern for code this
// jest config can't render/execute.

import { deleteBlueprints } from "@/lib/recalllab/recall2Store";
import fs from "fs";
import path from "path";

describe("deleteBlueprints", () => {
  it("REQUIRED: resolves immediately for an empty id list without touching IDB", async () => {
    await expect(deleteBlueprints([])).resolves.toBeUndefined();
  });
});

const STORE_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/recalllab/recall2Store.ts"), "utf8");
const LAB_SRC = fs.readFileSync(path.resolve(__dirname, "../../components/recalllab/Recall2Lab.tsx"), "utf8");

describe("lib/recalllab/recall2Store.ts — deleteBlueprints batches the mirror rewrite/notify, one call instead of N", () => {
  it("REQUIRED: loops idbDelete per id, then writes the localStorage mirror and fires notifyUpdate exactly once for the whole batch", () => {
    const idx = STORE_SRC.indexOf("export async function deleteBlueprints(");
    expect(idx).toBeGreaterThan(-1);
    const block = STORE_SRC.slice(idx, idx + 300);
    expect(block).toMatch(/if \(ids\.length === 0\) return;/);
    expect(block).toMatch(/for \(const id of ids\) await idbDelete\(id\);/);
    expect(block).toMatch(/lsWrite\(all\);/);
    expect(block).toMatch(/notifyUpdate\(\);/);
  });
});

describe("Recall2Lab.tsx — delete controls are wired into the live dashboard, gated by confirmation", () => {
  it("imports deleteBlueprint and deleteBlueprints", () => {
    expect(LAB_SRC).toMatch(/deleteBlueprint,\s*\n\s*deleteBlueprints,/);
  });

  it("REQUIRED: handleDeleteCard deletes then reloads the authoritative list", () => {
    const idx = LAB_SRC.indexOf("const handleDeleteCard = useCallback(async (id: string) => {");
    expect(idx).toBeGreaterThan(-1);
    const block = LAB_SRC.slice(idx, idx + 150);
    expect(block).toMatch(/await deleteBlueprint\(id\);/);
    expect(block).toMatch(/reload\(\);/);
  });

  it("REQUIRED: handleClearAllCards deletes every currently-loaded card, then reloads", () => {
    const idx = LAB_SRC.indexOf("const handleClearAllCards = useCallback(async () => {");
    expect(idx).toBeGreaterThan(-1);
    const block = LAB_SRC.slice(idx, idx + 200);
    expect(block).toMatch(/await deleteBlueprints\(blueprints\.map\(\(b\) => b\.id\)\);/);
    expect(block).toMatch(/reload\(\);/);
  });

  it("REQUIRED: per-card delete requires confirmation naming the destructive action before calling onDeleteCard", () => {
    const idx = LAB_SRC.indexOf('if (!window.confirm("Delete this card?');
    expect(idx).toBeGreaterThan(-1);
    const block = LAB_SRC.slice(idx, idx + 250);
    expect(block).toMatch(/void onDeleteCard\(card\.id\)/);
  });

  it("REQUIRED: 'clear all' requires confirmation stating the exact count before calling onClearAllCards", () => {
    const idx = LAB_SRC.indexOf("if (!window.confirm(`Delete all ${blueprints.length} card");
    expect(idx).toBeGreaterThan(-1);
    const block = LAB_SRC.slice(idx, idx + 250);
    expect(block).toMatch(/void onClearAllCards\(\)/);
  });

  it("the 'clear all' control only renders when there's at least one card to clear", () => {
    const idx = LAB_SRC.indexOf('text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Source-linked cards');
    expect(idx).toBeGreaterThan(-1);
    const block = LAB_SRC.slice(idx, idx + 400);
    expect(block).toMatch(/\{blueprints\.length > 0 && \(/);
  });
});
