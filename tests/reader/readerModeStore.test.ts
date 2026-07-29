// tests/reader/readerModeStore.test.ts
// Tests for lib/reader/readerModeStore.ts

import {
  READER_MODE_DESCRIPTORS,
  getReaderModeDescriptor,
  useReaderModeStore,
  type ReaderMode,
} from "../../lib/reader/readerModeStore";

// ── READER_MODE_DESCRIPTORS ────────────────────────────────────────────────

describe("READER_MODE_DESCRIPTORS", () => {
  it("contains exactly three modes", () => {
    expect(READER_MODE_DESCRIPTORS.length).toBe(3);
  });

  it("contains study, exam, and review modes", () => {
    const modes = READER_MODE_DESCRIPTORS.map((d) => d.mode);
    expect(modes).toContain("study");
    expect(modes).toContain("exam");
    expect(modes).toContain("review");
  });

  it("each descriptor has all required fields", () => {
    for (const d of READER_MODE_DESCRIPTORS) {
      expect(d.mode).toBeTruthy();
      expect(d.label).toBeTruthy();
      expect(d.shortLabel).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.icon).toBeTruthy();
    }
  });

  it("modes are in the expected order: study → exam → review", () => {
    expect(READER_MODE_DESCRIPTORS[0].mode).toBe("study");
    expect(READER_MODE_DESCRIPTORS[1].mode).toBe("exam");
    expect(READER_MODE_DESCRIPTORS[2].mode).toBe("review");
  });
});

// ── getReaderModeDescriptor ────────────────────────────────────────────────

describe("getReaderModeDescriptor", () => {
  it("returns the correct descriptor for study", () => {
    const d = getReaderModeDescriptor("study");
    expect(d.mode).toBe("study");
    expect(d.label).toBe("Study");
  });

  it("returns the correct descriptor for exam", () => {
    const d = getReaderModeDescriptor("exam");
    expect(d.mode).toBe("exam");
    expect(d.label).toBe("Exam");
  });

  it("returns the correct descriptor for review", () => {
    const d = getReaderModeDescriptor("review");
    expect(d.mode).toBe("review");
    expect(d.label).toBe("Review");
  });

  it("falls back to the first descriptor for an unknown mode", () => {
    const d = getReaderModeDescriptor("unknown" as ReaderMode);
    expect(d.mode).toBe("study");
  });
});

// ── useReaderModeStore ─────────────────────────────────────────────────────

describe("useReaderModeStore", () => {
  beforeEach(() => {
    // Reset store to default state between tests
    useReaderModeStore.setState({ mode: "study" });
  });

  it("initializes with study as the default mode", () => {
    expect(useReaderModeStore.getState().mode).toBe("study");
  });

  it("setMode updates the mode to exam", () => {
    useReaderModeStore.getState().setMode("exam");
    expect(useReaderModeStore.getState().mode).toBe("exam");
  });

  it("setMode updates the mode to review", () => {
    useReaderModeStore.getState().setMode("review");
    expect(useReaderModeStore.getState().mode).toBe("review");
  });

  it("setMode back to study resets correctly", () => {
    useReaderModeStore.getState().setMode("exam");
    useReaderModeStore.getState().setMode("study");
    expect(useReaderModeStore.getState().mode).toBe("study");
  });
});
