// tests/pdf/geometryBoundaryFidelity.test.ts
// Stabilization item 3 — the core bug fix: Strategy 3 (quote substring
// search) previously accepted a match after verifying only the first 60
// characters of a quote, then blindly trusted `pos + quote.length` for the
// rest. A fragment/misordered match (found via a valid 60-char prefix, but
// diverging from the real page text before the quote ends) was silently
// accepted and rendered as a highlight covering the WRONG text. Now the
// full quote is verified word-for-word before a match is accepted; an
// incomplete match is classified unresolved (empty rects, boundaryComplete:
// false) instead of rendered as a misleading fragment.

import { resolveAnchorGeometryDiagnostic, resolveWordGeometry } from "../../lib/pdf/resolveAnchorGeometry";
import { TextLayerRegistry } from "../../lib/page-intelligence/textLayerIndex";
import type { PageTextIndex } from "../../lib/page-intelligence/textLayerIndex";
import type { ReaderAnchor } from "../../lib/canonical/types";

function makeIndex(
  pageIndex: number,
  tokens: Array<{ str: string; x: number; y: number; w: number; h: number; itemIndex?: number }>,
): PageTextIndex {
  let cursor = 0;
  const built: PageTextIndex["tokens"] = tokens.map((t, i) => {
    const startChar = cursor;
    const endChar = cursor + t.str.length;
    cursor = endChar + 1;
    return { str: t.str, startChar, endChar, bbox: { x: t.x, y: t.y, w: t.w, h: t.h }, itemIndex: t.itemIndex ?? i };
  });
  const fullText = tokens.map(t => t.str).join(" ");
  return { pageIndex, fullText, tokens: built };
}

function makeAnchor(overrides: Partial<ReaderAnchor> & { pageIndex: number; startChar: number; endChar: number }): ReaderAnchor {
  return { quote: "", ...overrides } as ReaderAnchor;
}

beforeEach(() => TextLayerRegistry.clear());
afterEach(() => TextLayerRegistry.clear());

describe("resolveAnchorGeometryDiagnostic — REQUIRED: rejects a partial/fragment match instead of accepting it", () => {
  it("a quote whose first 60 chars match but whose LATER words diverge is classified unresolved, not rendered", () => {
    // Words 0-6 ("The mitochondria produces energy through cellular
    // respiration") are shared between the quote and the real page text —
    // that shared run is itself >60 chars, so the bounded-prefix search
    // finds a genuine position. The quote then claims "mechanisms daily"
    // while the real page text actually continues "processes constantly".
    // The old 60-char-prefix-only check stopped verifying right around
    // "respiratio" (chars 50-59) and would have accepted this whole match,
    // highlighting the wrong trailing tokens.
    const bodyWords = "The mitochondria produces energy through cellular respiration processes constantly".split(" ");
    TextLayerRegistry.set(
      makeIndex(0, bodyWords.map((str, i) => ({ str, x: i * 20, y: 100, w: 18, h: 12 }))),
    );
    const quote = "The mitochondria produces energy through cellular respiration mechanisms daily";
    expect(quote.length).toBeGreaterThan(60);
    const anchor = makeAnchor({ pageIndex: 0, startChar: 9999, endChar: 9999, quote });

    const result = resolveAnchorGeometryDiagnostic(anchor, 1.0);

    expect(result.rects).toHaveLength(0);
    expect(result.boundaryComplete).toBe(false);
    expect(result.unresolvedReason).toBe("incomplete-match");
    // Words 0-6 ("The mitochondria produces energy through cellular
    // respiration") DID match before the divergence at "mechanisms" vs "processes".
    expect(result.matchedWordCount).toBe(7);
    expect(result.expectedWordCount).toBe(quote.split(" ").length);
  });

  it("a genuinely complete match still resolves with boundaryComplete true and full word coverage", () => {
    const words = "The mitochondria produces energy through cellular respiration mechanisms daily".split(" ");
    TextLayerRegistry.set(
      makeIndex(0, words.map((str, i) => ({ str, x: i * 20, y: 100, w: 18, h: 12 }))),
    );
    const quote = words.join(" ");
    expect(quote.length).toBeGreaterThan(60);
    const anchor = makeAnchor({ pageIndex: 0, startChar: 9999, endChar: 9999, quote });

    const result = resolveAnchorGeometryDiagnostic(anchor, 1.0);

    expect(result.rects.length).toBeGreaterThan(0);
    expect(result.boundaryComplete).toBe(true);
    expect(result.unresolvedReason).toBeNull();
    expect(result.matchedWordCount).toBe(result.expectedWordCount);
    expect(result.source).toBe("quote");
    expect(result.geometryRectCount).toBe(result.rects.length);
  });

  it("REQUIRED (two-column): a quote from column 1 cannot accidentally resolve against column 2, and does not stop after the first matching 60 characters", () => {
    // Column 1 (x < 200) reads "The mitochondria is the powerhouse of the cell
    // and produces energy" — column 2 (x >= 200, but placed at DIFFERENT y so
    // it doesn't interleave into the same "line") happens to start with
    // similar-looking words for the first ~60 chars ("The mitochondria is the
    // powerhouse of") but diverges completely afterward ("plant not animal").
    const col1 = "The mitochondria is the powerhouse of the cell and produces energy".split(" ");
    const col2 = "The mitochondria is the powerhouse of plant not animal cells entirely".split(" ");
    TextLayerRegistry.set(
      makeIndex(0, [
        ...col1.map((str, i) => ({ str, x: i * 18, y: 100, w: 16, h: 12, itemIndex: i })),
        ...col2.map((str, i) => ({ str, x: i * 18, y: 300, w: 16, h: 12, itemIndex: col1.length + i })),
      ]),
    );
    // fullText = col1 joined then col2 joined (matching makeIndex's join order,
    // itself matching orderItemsForReading's left-column-then-right-column
    // convention for a real two-column page).
    const col1Quote = col1.join(" ");
    expect(col1Quote.length).toBeGreaterThan(60);

    const anchor = makeAnchor({ pageIndex: 0, startChar: 9999, endChar: 9999, quote: col1Quote });
    const result = resolveAnchorGeometryDiagnostic(anchor, 1.0);

    expect(result.boundaryComplete).toBe(true);
    expect(result.rects.length).toBeGreaterThan(0);
    // Every resolved rect must come from column 1's y=100 row, never column 2's y=300 row.
    expect(result.rects.every(r => r.y === 100)).toBe(true);
  });

  it("REQUIRED (two-column): the SAME 60-char prefix ambiguity does not cause column 2's quote to resolve against column 1", () => {
    const col1 = "The mitochondria is the powerhouse of the cell and produces energy".split(" ");
    const col2 = "The mitochondria is the powerhouse of plant not animal cells entirely".split(" ");
    TextLayerRegistry.set(
      makeIndex(0, [
        ...col1.map((str, i) => ({ str, x: i * 18, y: 100, w: 16, h: 12, itemIndex: i })),
        ...col2.map((str, i) => ({ str, x: i * 18, y: 300, w: 16, h: 12, itemIndex: col1.length + i })),
      ]),
    );
    const col2Quote = col2.join(" ");
    expect(col2Quote.length).toBeGreaterThan(60);

    const anchor = makeAnchor({ pageIndex: 0, startChar: 9999, endChar: 9999, quote: col2Quote });
    const result = resolveAnchorGeometryDiagnostic(anchor, 1.0);

    expect(result.boundaryComplete).toBe(true);
    expect(result.rects.length).toBeGreaterThan(0);
    expect(result.rects.every(r => r.y === 300)).toBe(true);
  });
});

describe("resolveWordGeometry — REQUIRED: does not resolve a word past the point where the sentence stops verifying", () => {
  it("returns null for a word index beyond where the real page text diverges from the claimed sentence", () => {
    // fullText genuinely contains "The mitochondria produces" then diverges —
    // the claimed sentence's word 4 ("ATP") is never actually there.
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "The", x: 0, y: 50, w: 20, h: 12 },
        { str: "mitochondria", x: 25, y: 50, w: 90, h: 12 },
        { str: "produces", x: 120, y: 50, w: 50, h: 12 },
        { str: "heat", x: 175, y: 50, w: 30, h: 12 }, // diverges from the claimed sentence here
      ]),
    );
    const claimedSentence = "The mitochondria produces ATP";
    // Word 3 ("ATP") is past the divergence point ("heat" is really there).
    expect(resolveWordGeometry(0, claimedSentence, 3, 1.0)).toBeNull();
  });

  it("still resolves a word that sits before the divergence point", () => {
    TextLayerRegistry.set(
      makeIndex(0, [
        { str: "The", x: 0, y: 50, w: 20, h: 12 },
        { str: "mitochondria", x: 25, y: 50, w: 90, h: 12 },
        { str: "produces", x: 120, y: 50, w: 50, h: 12 },
        { str: "heat", x: 175, y: 50, w: 30, h: 12 },
      ]),
    );
    const claimedSentence = "The mitochondria produces ATP";
    // Word 1 ("mitochondria") is before the divergence — still resolvable.
    expect(resolveWordGeometry(0, claimedSentence, 1, 1.0)).toMatchObject({ x: 25, y: 50, w: 90, h: 12 });
  });
});
