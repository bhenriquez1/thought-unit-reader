# Avrrio Reader — Stability Guidelines

Technical patterns that prevent the race conditions, memory leaks, and stale-state bugs that have historically caused the most regressions in this codebase.

---

## 1. AbortController Pattern

Every fetch that can be superseded (page change, mode change, unmount) must use an `AbortController`.

### Canonical pattern (ref-based, survives re-renders)

```ts
const abortRef = useRef<AbortController | null>(null);

async function fetchSomething() {
  // Cancel any in-flight request before starting a new one
  abortRef.current?.abort();
  const ctrl = new AbortController();
  abortRef.current = ctrl;

  try {
    const res = await fetch("/api/something", { signal: ctrl.signal });
    if (ctrl.signal.aborted) return; // superseded — discard result
    const data = await res.json();
    if (ctrl.signal.aborted) return;
    setState(data);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return; // expected
    setError(e instanceof Error ? e.message : String(e));
  }
}

// Cleanup on unmount or dependency change
useEffect(() => {
  return () => { abortRef.current?.abort(); };
}, []);
```

### Real usages in this codebase

| Location | Ref name | When aborted |
|---|---|---|
| `StudySpeechPanel.tsx` | `repairAbortRef` | Page turn |
| `PodcastLab.tsx` | `scriptFetchAbortRef` | Mode or page change |
| `PodcastLab.tsx` | `abortRef` | Playback stop or mode change |

---

## 2. Canonical Store Ownership

Each piece of state must be owned by exactly one store. Duplicating state across stores creates race conditions where one store's value becomes stale.

### Current canonical owners

| State | Canonical store | Notes |
|---|---|---|
| Active anchor / thought unit | `ReadingFocusStore.thoughtUnitId` | All reader components read from here |
| Speech playback state | `ReadingFocusStore.playbackState` | `'idle' \| 'playing' \| 'paused'` |
| Current word (karaoke) | `ReadingFocusStore.word` | Updated at anchor boundaries only |
| Pinned highlights | `useHighlightStore.highlights` | Per-doc, per-page, per-paragraph |
| Active PDF paragraph (insights sync) | `insightsPanelStore.activeParagraphId` | Different ID space than `thoughtUnitId` |
| Apex session history | `apexEngineStore.sessions` | Persisted via `partialize` |
| Pattern readiness | `apexEngineStore.patternReadiness` | Recomputed by `recalculate()` |
| Elena rewards | IndexedDB `avrrio-elena` / `child-rewards` | Loaded via `loadRewardState` |

### Anti-patterns to avoid

```ts
// ❌ DO NOT create a parallel "is speech playing" flag
const [isPlaying, setIsPlaying] = useState(false);

// ✅ Read from the canonical store
const isPlaying = useReadingFocusStore(s => s.playbackState !== 'idle');
```

```ts
// ❌ DO NOT store the active anchor in a local component ref
const activeAnchorRef = useRef<string | null>(null);

// ✅ Read from ReadingFocusStore
const activeAnchor = useReadingFocusStore(s => s.thoughtUnitId);
```

---

## 3. Stale Closure Prevention

React `useCallback` and `useEffect` capture the values of their dependencies at creation time. When a callback is long-lived (event listener, speech callback, scroll handler), the captured values become stale.

### The ref mirror pattern

```ts
// State for rendering
const [speed, setSpeed] = useState(1.0);
// Ref for callbacks that outlive the render cycle
const speedRef = useRef(1.0);

// Keep them in sync
useEffect(() => { speedRef.current = speed; }, [speed]);

// Callback reads the ref, never the stale closure value
const onSpeechEnd = useCallback(() => {
  const rate = Math.min(speedRef.current * 1.05, 1.8); // always current
  // ...
}, []); // intentionally empty deps — ref reads are always fresh
```

### Real usages in this codebase

- `StudySpeechPanel.tsx`: `speedRef` + `segIdxRef` for TTS speed slider and segment index
- `pages/index.tsx`: `userFocusLockedUntilRef` for focus-lock timestamp

---

## 4. Race Condition Prevention

### Scroll-to-card focus race (RC-3)

After a card click, scroll events briefly fire and can overwrite the user's explicit selection. The fix: set a `userFocusLockedUntilRef` timestamp and gate scroll-driven focus updates behind it.

```ts
const userFocusLockedUntilRef = useRef(0);
const FOCUS_LOCK_MS = 1500;

function handleCardClick(anchorId: string) {
  userFocusLockedUntilRef.current = Date.now() + FOCUS_LOCK_MS;
  setFocusedEvidenceId(anchorId);
}

function handleScrollSync(snippet: string | null) {
  if (Date.now() <= userFocusLockedUntilRef.current) return; // locked
  // ...proceed with scroll-driven sync
}
```

### Speech-priority race (RC-2 / H1)

Speech playback must claim a global token before starting audio. The token ensures two concurrent play requests don't overlap.

```ts
// Before calling fetchAndPlayAudio:
const token = Date.now();
speechTokenRef.current = token;
// After fetch:
if (speechTokenRef.current !== token) return; // superseded
```

### Page hydration freeze

Scroll events during page hydration hit stale content and produce wrong viewport-center calculations. Freeze sync events for a brief window after page navigation:

```ts
const syncFrozenRef = useRef(false);

useEffect(() => {
  syncFrozenRef.current = true;
  const t = setTimeout(() => { syncFrozenRef.current = false; }, 300);
  return () => clearTimeout(t);
}, [currentPage]);
```

---

## 5. Memory Cleanup

### Audio and blob URLs

```ts
// Always revoke blob URLs when done
const url = URL.createObjectURL(blob);
// ...
URL.revokeObjectURL(url);

// Clear the cache on book or page change to prevent stale audio
useEffect(() => {
  audioCacheRef.current = {};
}, [bookId, currentPage]);
```

### Event listeners

```ts
useEffect(() => {
  const handler = (e: MessageEvent) => { /* ... */ };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler); // always clean up
}, []);
```

### Zustand subscriptions

```ts
useEffect(() => {
  const unsub = useReadingFocusStore.subscribe(
    s => s.thoughtUnitId,
    (id) => { /* ... */ },
  );
  return unsub; // unsubscribe on unmount
}, []);
```

---

## 6. Server-Side Input Caps

Array inputs to AI API routes must be capped server-side to prevent oversized prompts, regardless of what the client sends.

```ts
// Canonical pattern — both adaptive-study-sheet.ts and dat-study-sheet.ts
const MAX_ANCHORS = 15;
const clampedAnchors = Array.isArray(rawAnchors) ? rawAnchors.slice(0, MAX_ANCHORS) : rawAnchors;
```

Apply this pattern to any route that injects an unbounded array into a prompt.
