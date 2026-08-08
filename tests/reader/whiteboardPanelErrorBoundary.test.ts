// tests/reader/whiteboardPanelErrorBoundary.test.ts
// Phase B3-4 — a render crash inside the Professor Whiteboard (TldrawCanvas/
// tldraw itself) must not take down the whole Reader page. Static-analysis
// coverage (see tests/reader/whiteboardPanelLearningStateWiring.test.ts's
// header comment for why: no jsdom/@testing-library in this repo's jest
// config, so component-tree tests aren't the established pattern here).

import fs from "fs";
import path from "path";

const INDEX_FILE = path.resolve(__dirname, "../../pages/index.tsx");

describe("pages/index.tsx — Phase B3-4: WhiteboardPanel is wrapped in ErrorBoundary", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  function whiteboardModalBlock(): string {
    const startIdx = src.indexOf("{/* Centered Whiteboard Modal */}");
    expect(startIdx).toBeGreaterThan(-1);
    const wbPanelIdx = src.indexOf("<WhiteboardPanel", startIdx);
    expect(wbPanelIdx).toBeGreaterThan(startIdx);
    return src.slice(startIdx, wbPanelIdx);
  }

  it("REQUIRED: ErrorBoundary catches inside a render crash — <ErrorBoundary> wraps <WhiteboardPanel>, not the other way around", () => {
    const block = whiteboardModalBlock();
    expect(block).toMatch(/<ErrorBoundary/);
  });

  it("REQUIRED: onError logs only structural, privacy-safe diagnostics — error name/message and ids/page numbers, never page content/text", () => {
    const block = whiteboardModalBlock();
    const errorHandlerIdx = block.indexOf("onError={(error) =>");
    expect(errorHandlerIdx).toBeGreaterThan(-1);
    const handlerBlock = block.slice(errorHandlerIdx, errorHandlerIdx + 300);
    expect(handlerBlock).toMatch(/message: error\.message,/);
    expect(handlerBlock).toMatch(/name: error\.name,/);
    expect(handlerBlock).toMatch(/bookId,/);
    expect(handlerBlock).toMatch(/currentPage,/);
    expect(handlerBlock).toMatch(/pageTruthKey,/);
    // Never logs raw page text / study model content.
    expect(handlerBlock).not.toMatch(/pageText/);
    expect(handlerBlock).not.toMatch(/studyModel/);
  });

  it("REQUIRED: retry uses current page identity — resetKeys ties the boundary to the LIVE resolvedDocumentId/bookId, pageTruthKey, and currentPage, so navigating to a different document/page always rebuilds fresh instead of staying wedged on a stale error", () => {
    const block = whiteboardModalBlock();
    expect(block).toMatch(/resetKeys=\{\[resolvedDocumentId \?\? bookId \?\? "", pageTruthKey \?\? "", currentPage \?\? 0\]\}/);
  });

  it("the <WhiteboardPanel> element itself is inside the <ErrorBoundary>...</ErrorBoundary> pair, not a sibling", () => {
    const startIdx = src.indexOf("{/* Centered Whiteboard Modal */}");
    const boundaryOpenIdx = src.indexOf("<ErrorBoundary", startIdx);
    const panelIdx = src.indexOf("<WhiteboardPanel", startIdx);
    const boundaryCloseIdx = src.indexOf("</ErrorBoundary>", panelIdx);
    expect(boundaryOpenIdx).toBeGreaterThan(-1);
    expect(panelIdx).toBeGreaterThan(boundaryOpenIdx);
    expect(boundaryCloseIdx).toBeGreaterThan(panelIdx);
  });
});
