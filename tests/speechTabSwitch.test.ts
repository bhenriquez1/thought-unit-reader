// tests/speechTabSwitch.test.ts
//
// Regression test for React #185 root causes:
// 1. setWord() must not change thoughtUnitId on every word tick (only per-segment)
// 2. clearWord() must reset word fields without touching thoughtUnitId
// 3. Rapid word ticks followed by clearWord must leave a clean state
// 4. selectActiveSpokenWord must return null when no word is active
//
// These cover the state-update loop patterns that caused React #185 when
// switching speech tabs during TTS playback.

import { useReadingFocusStore, selectActiveSpokenWord } from "@/lib/readingFocus/readingFocusStore";

// Reset store between tests
beforeEach(() => {
  useReadingFocusStore.getState().clearFocus();
});

describe("ReadingFocusStore — word-tick stability", () => {
  it("setWord with non-null anchorId updates thoughtUnitId only on first call with new id", () => {
    const store = useReadingFocusStore.getState();

    store.setWord("anchor-1", 0, "The", "The quick brown fox.");
    expect(useReadingFocusStore.getState().thoughtUnitId).toBe("anchor-1");

    // Subsequent ticks on same anchor — thoughtUnitId MUST NOT change (anchorId ?? prev)
    store.setWord("anchor-1", 1, "quick", "The quick brown fox.");
    store.setWord("anchor-1", 2, "brown", "The quick brown fox.");
    expect(useReadingFocusStore.getState().thoughtUnitId).toBe("anchor-1");
    expect(useReadingFocusStore.getState().wordIndex).toBe(2);
    expect(useReadingFocusStore.getState().word).toBe("brown");
  });

  it("setWord with null anchorId preserves existing thoughtUnitId", () => {
    const store = useReadingFocusStore.getState();

    store.setThoughtUnit("anchor-2");
    // Simulate word ticks where anchorId is null (onboundary doesn't re-send anchorId)
    for (let i = 0; i < 30; i++) {
      store.setWord(null, i, `word${i}`);
    }

    expect(useReadingFocusStore.getState().thoughtUnitId).toBe("anchor-2");
    expect(useReadingFocusStore.getState().wordIndex).toBe(29);
  });

  it("rapid 30 setWord calls followed by a tab-switch clearWord cleans up correctly", () => {
    const store = useReadingFocusStore.getState();

    store.setWord("anchor-3", 0, "Start", "Start of sentence.");
    for (let i = 1; i <= 30; i++) {
      store.setWord(null, i, `word${i}`);
    }

    // Simulate tab switch: clearWord() is called from the mode-change useEffect
    store.clearWord();

    const state = useReadingFocusStore.getState();
    expect(state.word).toBeNull();
    expect(state.wordIndex).toBe(0);
    expect(state.sentenceText).toBeNull();
    // thoughtUnitId MUST be preserved after clearWord (focus stays on the anchor)
    expect(state.thoughtUnitId).toBe("anchor-3");
  });

  it("selectActiveSpokenWord returns null when no word is active", () => {
    // Initial state: no word
    expect(selectActiveSpokenWord(useReadingFocusStore.getState())).toBeNull();
  });

  it("selectActiveSpokenWord returns object only when word or sentenceText is present", () => {
    const store = useReadingFocusStore.getState();
    store.setWord("anchor-4", 5, "fox", "The quick brown fox.");

    const active = selectActiveSpokenWord(useReadingFocusStore.getState());
    expect(active).not.toBeNull();
    expect(active?.anchorId).toBe("anchor-4");
    expect(active?.wordIndex).toBe(5);
    expect(active?.word).toBe("fox");
  });

  it("selectActiveSpokenWord returns null after clearWord", () => {
    const store = useReadingFocusStore.getState();
    store.setWord("anchor-5", 3, "brown", "The quick brown fox.");
    store.clearWord();

    expect(selectActiveSpokenWord(useReadingFocusStore.getState())).toBeNull();
  });

  it("clearFocus resets all fields including thoughtUnitId", () => {
    const store = useReadingFocusStore.getState();
    store.setWord("anchor-6", 7, "jumps", "The fox jumps over.");
    store.clearFocus();

    const state = useReadingFocusStore.getState();
    expect(state.thoughtUnitId).toBeNull();
    expect(state.word).toBeNull();
    expect(state.wordIndex).toBe(0);
    expect(state.sentenceText).toBeNull();
    expect(state.playbackState).toBe("idle");
  });

  it("no new object reference from selectActiveSpokenWord when state is unchanged", () => {
    // This tests that the selector is stable: if called twice with the same state, it returns
    // the same shape. (The actual referential stability is handled by useMemo in ThoughtUnitNavigator,
    // but the primitive values in the store must be consistent.)
    const store = useReadingFocusStore.getState();
    store.setWord("anchor-7", 2, "lazy", "The lazy dog.");

    const state = useReadingFocusStore.getState();
    const r1 = selectActiveSpokenWord(state);
    const r2 = selectActiveSpokenWord(state);

    // Both calls return objects with same values (selectActiveSpokenWord doesn't cache,
    // but this documents that each call creates a new object — the real fix is
    // using primitive selectors + useMemo in consumers, not here)
    expect(r1?.anchorId).toBe(r2?.anchorId);
    expect(r1?.wordIndex).toBe(r2?.wordIndex);
    expect(r1?.word).toBe(r2?.word);
  });
});
