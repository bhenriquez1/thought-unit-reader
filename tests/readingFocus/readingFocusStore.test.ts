// tests/readingFocus/readingFocusStore.test.ts
// Real behavioral tests — zustand stores need no DOM, so this exercises the
// actual store, not a source-regex proxy for it.

import { useReadingFocusStore } from "../../lib/readingFocus/readingFocusStore";

function resetStore() {
  useReadingFocusStore.setState({
    thoughtUnitId: null,
    sentenceText: null,
    wordIndex: 0,
    word: null,
    playbackState: "idle",
    pdfRenderedAnchorIds: [],
    pdfRenderedWordAnchorId: null,
    pdfClickCursor: null,
    annotationRenderStage: null,
    annotationRenderCounts: null,
  });
}

describe("readingFocusStore — annotationRenderStage / annotationRenderCounts", () => {
  beforeEach(resetStore);

  it("starts null (no problem / not yet computed)", () => {
    const s = useReadingFocusStore.getState();
    expect(s.annotationRenderStage).toBeNull();
    expect(s.annotationRenderCounts).toBeNull();
  });

  it("REQUIRED: setAnnotationRenderStage writes stage and counts together, in sync", () => {
    useReadingFocusStore.getState().setAnnotationRenderStage(
      "geometry_resolution",
      { grounded: 6, geometryResolved: 1, rendered: 1 },
    );
    const s = useReadingFocusStore.getState();
    expect(s.annotationRenderStage).toBe("geometry_resolution");
    expect(s.annotationRenderCounts).toEqual({ grounded: 6, geometryResolved: 1, rendered: 1 });
  });

  it("accepts the overlay_render stage distinctly from geometry_resolution", () => {
    useReadingFocusStore.getState().setAnnotationRenderStage(
      "overlay_render",
      { grounded: 4, geometryResolved: 4, rendered: 0 },
    );
    expect(useReadingFocusStore.getState().annotationRenderStage).toBe("overlay_render");
  });

  it("clearing back to null resets both fields together (never one without the other)", () => {
    useReadingFocusStore.getState().setAnnotationRenderStage("geometry_resolution", { grounded: 3, geometryResolved: 0, rendered: 0 });
    useReadingFocusStore.getState().setAnnotationRenderStage(null, null);
    const s = useReadingFocusStore.getState();
    expect(s.annotationRenderStage).toBeNull();
    expect(s.annotationRenderCounts).toBeNull();
  });

  it("REQUIRED: clearFocus() (page/book change) resets annotationRenderStage — a stale render-stage warning must not survive a page change", () => {
    useReadingFocusStore.getState().setAnnotationRenderStage("geometry_resolution", { grounded: 6, geometryResolved: 1, rendered: 1 });
    useReadingFocusStore.getState().clearFocus();
    const s = useReadingFocusStore.getState();
    expect(s.annotationRenderStage).toBeNull();
    expect(s.annotationRenderCounts).toBeNull();
  });

  it("clearFocus still resets its pre-existing fields too (no regression)", () => {
    useReadingFocusStore.getState().setThoughtUnit("anchor-1");
    useReadingFocusStore.getState().setPlaybackState("playing");
    useReadingFocusStore.getState().clearFocus();
    const s = useReadingFocusStore.getState();
    expect(s.thoughtUnitId).toBeNull();
    expect(s.playbackState).toBe("idle");
  });
});
