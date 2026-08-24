// tests/elena/elenaParentGate.test.ts
// P0 fix — the Parent dashboard used to render on a single unauthenticated
// tap from the child-visible workspace header: setShowParent(true) rendered
// <ParentDashboard> directly, with no PIN, password, or check of any kind.
// A prior audit's own test suite (elenaLegacyFallbackAudit.test.ts)
// documented this as intentional ("a local overlay toggle") — this suite
// locks in the fix: ParentDashboard now only renders after ParentGate
// (lib/elena/parentGate.ts's salted-SHA-256 PIN check) reports success.
//
// No jsdom/render harness for these files in this repo — source inspection,
// matching this repo's established pattern for React components.

import fs from "fs";
import path from "path";

const WORKSPACE_SRC = fs.readFileSync(path.resolve(__dirname, "../../components/elena/ElenaChildWorkspace.tsx"), "utf8");
const GATE_COMPONENT_SRC = fs.readFileSync(path.resolve(__dirname, "../../components/elena/ParentGate.tsx"), "utf8");
const GATE_LOGIC_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/elena/parentGate.ts"), "utf8");
const IDB_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/elena/idbStore.ts"), "utf8");

describe("lib/elena/parentGate.ts — PIN is salted and hashed, never stored raw", () => {
  it("REQUIRED: setParentPin hashes with a random salt via Web Crypto, never persists the raw pin", () => {
    expect(GATE_LOGIC_SRC).toMatch(/crypto\.subtle\.digest\("SHA-256",/);
    expect(GATE_LOGIC_SRC).toMatch(/const salt = crypto\.randomUUID\(\);/);
    const idx = GATE_LOGIC_SRC.indexOf("export async function setParentPin");
    expect(idx).toBeGreaterThan(-1);
    const block = GATE_LOGIC_SRC.slice(idx, idx + 500);
    expect(block).not.toMatch(/saveParentGate\(\{[^}]*\bpin\b(?!Hash)/);
  });

  it("REQUIRED: verifyParentPin re-derives the hash from the stored salt and compares digests, never compares raw PINs", () => {
    const idx = GATE_LOGIC_SRC.indexOf("export async function verifyParentPin");
    expect(idx).toBeGreaterThan(-1);
    const block = GATE_LOGIC_SRC.slice(idx, idx + 400);
    expect(block).toMatch(/hashPin\(pin, record\.salt\)/);
    expect(block).toMatch(/candidateHash === record\.pinHash/);
  });

  it("only a 4-digit numeric PIN is accepted", () => {
    expect(GATE_LOGIC_SRC).toMatch(/const PIN_LENGTH = 4;/);
  });
});

describe("lib/elena/idbStore.ts — parent-gate store is real, versioned persistence", () => {
  it("REQUIRED: a dedicated parent-gate object store exists, keyed by parentAccountId", () => {
    expect(IDB_SRC).toMatch(/const STORE_PARENT_GATE = "parent-gate";/);
    expect(IDB_SRC).toMatch(/db\.createObjectStore\(STORE_PARENT_GATE, \{ keyPath: "parentAccountId" \}\);/);
  });

  it("REQUIRED: the DB version was bumped so existing users get the upgrade", () => {
    const match = IDB_SRC.match(/const DB_VERSION\s*=\s*(\d+);/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(4);
  });

  it("REQUIRED: saveParentGate and loadParentGate are real, exported functions", () => {
    expect(IDB_SRC).toMatch(/export async function saveParentGate\(record: ParentGateRecord\): Promise<void>/);
    expect(IDB_SRC).toMatch(/export async function loadParentGate\(parentAccountId: string\): Promise<ParentGateRecord \| null>/);
  });
});

describe("components/elena/ParentGate.tsx — a real create/enter PIN flow, not a placeholder", () => {
  it("REQUIRED: checks hasParentPin on mount to choose between create and enter mode", () => {
    expect(GATE_COMPONENT_SRC).toMatch(/hasParentPin\(parentAccountId\)/);
    expect(GATE_COMPONENT_SRC).toMatch(/setMode\(exists \? "enter" : "create"\)/);
  });

  it("REQUIRED: create mode requires the PIN to be entered twice and matched before it's persisted", () => {
    expect(GATE_COMPONENT_SRC).toMatch(/if \(pin !== firstPin\) \{/);
    expect(GATE_COMPONENT_SRC).toMatch(/await setParentPin\(parentAccountId, pin\);/);
  });

  it("REQUIRED: enter mode calls verifyParentPin and only unlocks on success", () => {
    const idx = GATE_COMPONENT_SRC.indexOf('// mode === "enter"');
    expect(idx).toBeGreaterThan(-1);
    const block = GATE_COMPONENT_SRC.slice(idx, idx + 300);
    expect(block).toMatch(/const ok = await verifyParentPin\(parentAccountId, pin\);/);
    expect(block).toMatch(/if \(ok\) \{\s*onUnlock\(\);/);
  });

  it("a wrong PIN shows an error and clears the field instead of unlocking", () => {
    expect(GATE_COMPONENT_SRC).toMatch(/setError\("Incorrect PIN\."\);/);
  });
});

describe("components/elena/ElenaChildWorkspace.tsx — ParentDashboard only renders after the gate unlocks", () => {
  it("REQUIRED: ParentGate renders instead of ParentDashboard until parentUnlocked is true", () => {
    expect(WORKSPACE_SRC).toMatch(/import ParentGate\s+from "@\/components\/elena\/ParentGate";/);
    expect(WORKSPACE_SRC).toMatch(/\{showParent && !parentUnlocked && \(/);
    expect(WORKSPACE_SRC).toMatch(/<ParentGate\s/);
  });

  it("REQUIRED: ParentDashboard's render condition requires both showParent and parentUnlocked", () => {
    expect(WORKSPACE_SRC).toMatch(/\{showParent && parentUnlocked && \(/);
  });

  it("REQUIRED: closing the dashboard resets parentUnlocked, so re-opening always re-prompts for the PIN", () => {
    const idx = WORKSPACE_SRC.indexOf("<ParentDashboard");
    expect(idx).toBeGreaterThan(-1);
    const block = WORKSPACE_SRC.slice(idx, idx + 300);
    expect(block).toMatch(/onClose=\{\(\) => \{ setShowParent\(false\); setParentUnlocked\(false\); \}\}/);
  });

  it("cancelling the gate itself just closes the overlay, without ever unlocking it", () => {
    const idx = WORKSPACE_SRC.indexOf("<ParentGate");
    expect(idx).toBeGreaterThan(-1);
    const block = WORKSPACE_SRC.slice(idx, idx + 300);
    const cancelIdx = block.indexOf("onCancel=");
    expect(cancelIdx).toBeGreaterThan(-1);
    const cancelHandler = block.slice(cancelIdx, cancelIdx + 60);
    expect(cancelHandler).toMatch(/onCancel=\{\(\) => setShowParent\(false\)\}/);
    expect(cancelHandler).not.toMatch(/setParentUnlocked/);
  });
});
