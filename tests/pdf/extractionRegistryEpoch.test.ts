// tests/pdf/extractionRegistryEpoch.test.ts
// Regression coverage for the RC8 fix from the Thought Unit Engine identity
// audit: PageBridgeRegistry / TextLayerRegistry are keyed only by pageIndex,
// with no documentId component — correctness depended entirely on clear()
// always running before a new extraction's set() calls, and never running
// again until that extraction finished. A rapid document switch mid-
// extraction breaks that: extraction A (document X) is still awaiting an
// in-flight page's async work when the user switches documents; extraction B
// (document Y) calls clear() and starts writing; A's late page-write would
// then land in B's now-active registry under whatever pageIndex A was
// working on — the deepest point in the whole pipeline cross-document
// contamination could originate.
//
// Fix: clear() now bumps an epoch counter and returns it; set() accepts an
// optional forEpoch and silently drops the write if it no longer matches
// the CURRENT epoch (i.e. a newer clear() has since run).

import fs from "fs";
import path from "path";
import { PageBridgeRegistry } from "../../lib/page-intelligence/pageBridgeRegistry";
import { TextLayerRegistry, type PageTextIndex } from "../../lib/page-intelligence/textLayerIndex";
import type { StructuredPageBridge } from "../../lib/pdf/structuredPageText";

function bridge(): StructuredPageBridge {
  return { paragraphMappings: [] };
}

function textIndex(pageIndex: number): PageTextIndex {
  return { pageIndex, fullText: "", tokens: [] };
}

describe("PageBridgeRegistry — epoch-guarded writes", () => {
  it("clear() returns a new, higher epoch each call", () => {
    const a = PageBridgeRegistry.clear();
    const b = PageBridgeRegistry.clear();
    expect(b).toBeGreaterThan(a);
    expect(PageBridgeRegistry.currentEpoch()).toBe(b);
  });

  it("a set() stamped with the CURRENT epoch is applied", () => {
    const epoch = PageBridgeRegistry.clear();
    PageBridgeRegistry.set(0, bridge(), epoch);
    expect(PageBridgeRegistry.get(0)).toBeDefined();
  });

  it("REQUIRED: a set() stamped with a SUPERSEDED epoch is silently dropped, not applied — the rapid document-switch reproducer", () => {
    const staleEpoch = PageBridgeRegistry.clear(); // "extraction A" starts
    // "extraction B" starts before A's page-write lands — a real document switch.
    PageBridgeRegistry.clear();
    // A's late write, still stamped with its own (now superseded) epoch.
    PageBridgeRegistry.set(3, bridge(), staleEpoch);
    expect(PageBridgeRegistry.get(3)).toBeUndefined();
  });

  it("a set() with no forEpoch argument is never rejected (untracked callers keep working exactly as before)", () => {
    PageBridgeRegistry.clear();
    PageBridgeRegistry.set(7, bridge());
    expect(PageBridgeRegistry.get(7)).toBeDefined();
  });

  it("clear() itself always wipes every entry regardless of epoch", () => {
    const epoch = PageBridgeRegistry.clear();
    PageBridgeRegistry.set(0, bridge(), epoch);
    expect(PageBridgeRegistry.get(0)).toBeDefined();
    PageBridgeRegistry.clear();
    expect(PageBridgeRegistry.get(0)).toBeUndefined();
  });
});

describe("TextLayerRegistry — epoch-guarded writes", () => {
  it("clear() returns a new, higher epoch each call", () => {
    const a = TextLayerRegistry.clear();
    const b = TextLayerRegistry.clear();
    expect(b).toBeGreaterThan(a);
    expect(TextLayerRegistry.currentEpoch()).toBe(b);
  });

  it("a set() stamped with the CURRENT epoch is applied", () => {
    const epoch = TextLayerRegistry.clear();
    TextLayerRegistry.set(textIndex(0), epoch);
    expect(TextLayerRegistry.get(0)).toBeDefined();
  });

  it("REQUIRED: a set() stamped with a SUPERSEDED epoch is silently dropped — the same rapid document-switch reproducer as PageBridgeRegistry", () => {
    const staleEpoch = TextLayerRegistry.clear();
    TextLayerRegistry.clear();
    TextLayerRegistry.set(textIndex(3), staleEpoch);
    expect(TextLayerRegistry.get(3)).toBeUndefined();
  });

  it("a set() with no forEpoch argument is never rejected", () => {
    TextLayerRegistry.clear();
    TextLayerRegistry.set(textIndex(7));
    expect(TextLayerRegistry.get(7)).toBeDefined();
  });
});

describe("lib/pdfjs-handler.ts — both extraction functions actually thread the epoch through", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(path.resolve(__dirname, "../../lib/pdfjs-handler.ts"), "utf8"); });

  it("REQUIRED: extractPageTexts captures clear()'s return value and stamps both set() calls with it", () => {
    const idx = src.indexOf("async function extractPageTexts(");
    expect(idx).toBeGreaterThan(-1);
    const nextFn = src.indexOf("export async function extractPageTextsIncremental(");
    const body = src.slice(idx, nextFn);
    expect(body).toMatch(/const textEpoch = TextLayerRegistry\.clear\(\);/);
    expect(body).toMatch(/const bridgeEpoch = PageBridgeRegistry\.clear\(\);/);
    expect(body).toMatch(/TextLayerRegistry\.set\(\s*\n?\s*buildPageTextIndex\([^)]*\),\s*\n?\s*textEpoch,?\s*\n?\s*\);/);
    expect(body).toMatch(/PageBridgeRegistry\.set\(i - 1, bridge, bridgeEpoch\);/);
  });

  it("REQUIRED: extractPageTextsIncremental captures clear()'s return value and stamps both set() calls with it", () => {
    const idx = src.indexOf("export async function extractPageTextsIncremental(");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx);
    expect(body).toMatch(/const textEpoch = TextLayerRegistry\.clear\(\);/);
    expect(body).toMatch(/const bridgeEpoch = PageBridgeRegistry\.clear\(\);/);
    expect(body).toMatch(/TextLayerRegistry\.set\(\s*\n?\s*buildPageTextIndex\([^)]*\),\s*\n?\s*textEpoch,?\s*\n?\s*\);/);
    expect(body).toMatch(/PageBridgeRegistry\.set\(i - 1, bridge, bridgeEpoch\);/);
  });
});
