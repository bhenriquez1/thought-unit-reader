// components/WhiteboardPanel.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WhiteboardStep } from "@/lib/WhiteboardExplanationService";
import Whiteboard from "./Whiteboard";
import { Button } from "./ui/button";
import { AnimatePresence, motion } from "framer-motion";

/** Simple, fast hash for cache keys */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/** Default lightweight diagram/formula heuristic (can be overridden) */
function defaultDiagramHeuristic(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (/\b(diagram|figure|fig\.|table|chart|graph|flow|formula|equation|reaction|proof)\b/.test(t))
    return true;
  if (/[∑∏∫√≈≠≤≥→↔⇌Δ±∞μ°Ωπθαβγλ≃≅⊂⊃∈∉∧∨⊗◦]/.test(text)) return true;
  return false;
}

type StickyNote = { pageNumber: number; content: string };

type Props = {
  concept: string;
  context: string;
  stickyNotes?: StickyNote[];
  /** Run once on mount when true */
  autoTrigger?: boolean;
  lessonTitle?: string;

  /** 🔐 Optional: for step-note persistence in Firestore */
  lessonId?: string; // e.g., your bookId or a slug of lessonTitle
  userId?: string;   // current user id

  /** NEW: auto refresh when page changes (debounced + cached) */
  reExplainOnPageChange?: boolean;
  currentPage?: number;

  /** Optional override for the diagram detector used by auto-refresh */
  containsDiagramOrFormula?: (text: string) => boolean;

  /** Optional: max cached entries in-memory + localStorage mirror */
  cacheSize?: number; // default 20

  /** When provided, skip API and display these steps directly (finalStudyModel-driven path) */
  prebuiltSteps?: WhiteboardStep[];
};

/** In-memory LRU-ish cache (oldest evicted on overflow) */
const memCache = new Map<
  string,
  { steps: WhiteboardStep[]; narrationScript: string; audioDataUrl?: string }
>();

export default function WhiteboardPanel({
  concept,
  context,
  stickyNotes = [],
  autoTrigger = false,
  lessonTitle = "Whiteboard Lesson",
  lessonId,
  userId,

  reExplainOnPageChange = false,
  currentPage,
  containsDiagramOrFormula = defaultDiagramHeuristic,
  cacheSize = 20,
  prebuiltSteps,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<WhiteboardStep[]>([]);
  const [narrationScript, setNarrationScript] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  // ✨ UX niceties (animation, zoom, cues)
  const [isOpen, setIsOpen] = useState(true);
  const [zoom, setZoom] = useState(0.95); // not “too zoomed” by default
  const [justGenerated, setJustGenerated] = useState(false); // brief glow when new steps land
  const [justDetected, setJustDetected] = useState(false);   // shows “Diagram detected” pill
  const [pulseExplain, setPulseExplain] = useState(false);   // pulse the button briefly when auto
  const [showDetectedChip, setShowDetectedChip] = useState(false); // your original chip (auto-refresh)
  const scrollRef = useRef<HTMLDivElement>(null);

  const debounceRef = useRef<number | null>(null);
  const lastCallTsRef = useRef<number>(0); // rate-limit

  const effectiveConcept = (concept || "").trim();
  const effectiveContext = (context || "").trim();

  /** Build stable cache key */
  const cacheKey = useMemo(() => {
    const base = JSON.stringify({
      lessonId: lessonId || lessonTitle || "lesson",
      page: currentPage || 0,
      cHash: hashString(effectiveConcept),
      xHash: hashString(effectiveContext),
    });
    return `wb:${hashString(base)}`;
  }, [lessonId, lessonTitle, currentPage, effectiveConcept, effectiveContext]);

  /** Convert a data: URL back to Blob */
  function dataUrlToBlob(dataUrl: string): Blob {
    const [hdr, b64] = dataUrl.split(",");
    const mime = /data:(.*?);base64/.exec(hdr)?.[1] || "audio/mpeg";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  /** Try to read from localStorage mirror (for a warm reload) */
  const tryLocalRestore = () => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed?.steps && parsed?.narrationScript) {
        setSteps(parsed.steps);
        setNarrationScript(parsed.narrationScript);
        if (parsed.audioDataUrl) {
          try {
            const b = dataUrlToBlob(parsed.audioDataUrl);
            setAudioBlob(b);
          } catch {
            setAudioBlob(null);
          }
        } else {
          setAudioBlob(null);
        }
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  };

  /** Write to both memory cache and localStorage (bounded) */
  const writeCache = (key: string, payload: { steps: WhiteboardStep[]; narrationScript: string; audioBlob?: Blob | null }) => {
    // memory
    memCache.set(key, {
      steps: payload.steps,
      narrationScript: payload.narrationScript,
      audioDataUrl: undefined, // keep memory lean
    });
    // evict oldest
    if (memCache.size > cacheSize) {
      const firstKey = memCache.keys().next().value as string | undefined;
      if (firstKey) memCache.delete(firstKey);
    }

    // localStorage mirror (include audio as dataURL if present)
    try {
      const audioDataUrlPromise = payload.audioBlob
        ? blobToDataURL(payload.audioBlob)
        : Promise.resolve<string | undefined>(undefined);

      audioDataUrlPromise.then((audioDataUrl) => {
        const toStore = JSON.stringify({
          steps: payload.steps,
          narrationScript: payload.narrationScript,
          audioDataUrl,
          savedAt: Date.now(),
        });
        localStorage.setItem(key, toStore);
      }).catch(() => {});
    } catch {
      /* ignore localStorage quota errors */
    }
  };

  /** Try a cache hit (mem → local) */
  const tryCache = (): boolean => {
    const memHit = memCache.get(cacheKey);
    if (memHit?.steps?.length) {
      setSteps(memHit.steps);
      setNarrationScript(memHit.narrationScript);
      setAudioBlob(null); // LS restore may set audio later if needed
      return true;
    }
    return tryLocalRestore();
  };

  /** Sync prebuiltSteps → state when provided (finalStudyModel-driven, no API call) */
  useEffect(() => {
    if (!prebuiltSteps || prebuiltSteps.length === 0) return;
    setSteps(prebuiltSteps);
    setNarrationScript(prebuiltSteps.map((s) => s.description ?? "").join(" "));
    setAudioBlob(null);
    setLoading(false);
  }, [prebuiltSteps]);

  /** Core generate call (with cache + state wiring) */
  const runGenerate = useCallback(async () => {
    if (prebuiltSteps && prebuiltSteps.length > 0) return; // prebuilt takes precedence
    if (!effectiveConcept || !effectiveContext) return;

    // rate-limit: 1 call / 3s
    const now = Date.now();
    if (now - lastCallTsRef.current < 3000) return;
    lastCallTsRef.current = now;

    // cache first
    if (tryCache()) return;

    setLoading(true);
    try {
      const { generateWhiteboardExplanationWithAudio } = await import(
        "@/lib/WhiteboardExplanationService"
      );
      const result = await generateWhiteboardExplanationWithAudio(effectiveConcept, effectiveContext);
      setSteps(result.steps);
      setNarrationScript(result.narrationScript);
      setAudioBlob(result.audioBlob ?? null);

      // glow + scroll
      setJustGenerated(true);
      setTimeout(() => setJustGenerated(false), 1400);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }));

      writeCache(cacheKey, {
        steps: result.steps,
        narrationScript: result.narrationScript,
        audioBlob: result.audioBlob ?? null,
      });
    } catch (err) {
      console.error("Error generating explanation:", err);
      setAudioBlob(null);
      setSteps([]);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, effectiveConcept, effectiveContext]);

  /** Manual trigger button */
  const handleExplainConcept = async () => {
    setShowDetectedChip(false); // manual run — hide chip
    await runGenerate();
  };

  /** Auto-trigger once on mount if requested */
  useEffect(() => {
    if (autoTrigger && effectiveConcept && effectiveContext) {
      // show detected pill + pulse the button briefly
      setJustDetected(true);
      setPulseExplain(true);
      const t1 = setTimeout(() => setJustDetected(false), 2500);
      const t2 = setTimeout(() => setPulseExplain(false), 1400);
      runGenerate();
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger, effectiveConcept, effectiveContext]);

  /** Auto re-explain when page changes (debounced + heuristic) */
  useEffect(() => {
    if (!reExplainOnPageChange) return;
    if (!effectiveConcept || !effectiveContext) return;
    if (!containsDiagramOrFormula(effectiveConcept)) return; // cheap guard

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setShowDetectedChip(true);
      runGenerate();
    }, 600) as unknown as number;

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reExplainOnPageChange, currentPage, effectiveConcept, effectiveContext]);

  // Keyboard zoom shortcuts (Cmd/Ctrl +/−/0)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom((z) => Math.min(1.75, +(z + 0.05).toFixed(2)));
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(0.5, +(z - 0.05).toFixed(2)));
      } else if (e.key.toLowerCase() === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const zoomPct = Math.round(zoom * 100);
  const canRender = steps.length > 0;

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.aside
          key="wb-panel"
          initial={{ x: 24, opacity: 0, scale: 0.98 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: 24, opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="flex flex-col gap-3"
        >
          {/* Header / Controls */}
          <div className="flex items-center gap-2 flex-wrap relative">
            {/* “Diagram detected” pill (auto-trigger cue) */}
            <AnimatePresence>
              {justDetected && (
                <motion.div
                  initial={{ y: -10, opacity: 0, scale: 0.95 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: -10, opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  className="text-xs px-2 py-1 rounded-full bg-yellow-500/90 text-black shadow"
                >
                  ✨ Diagram detected
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-2">
              <motion.div
                animate={
                  pulseExplain
                    ? {
                        scale: [1, 1.05, 1],
                        boxShadow: [
                          "0 0 0 0",
                          "0 0 0 8px rgba(234,179,8,0.15)",
                          "0 0 0 0",
                        ],
                      }
                    : {}
                }
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="inline-block rounded"
              >
                <Button onClick={handleExplainConcept} disabled={loading || !effectiveConcept}>
                  {loading ? "Generating..." : "🎓 Explain with Whiteboard"}
                </Button>
              </motion.div>

              {canRender && (
                <>
                  <div className="h-6 w-px bg-gray-700 mx-1" />
                  <label className="text-xs opacity-80">Zoom</label>
                  <button
                    className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
                    onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
                    aria-label="Zoom out"
                    title="Zoom out"
                  >
                    −
                  </button>
                  <input
                    className="mx-2 w-36 accent-yellow-400"
                    type="range"
                    min={0.5}
                    max={1.75}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                  />
                  <span className="text-xs tabular-nums w-10 text-center">{zoomPct}%</span>
                  <button
                    className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
                    onClick={() => setZoom(1)}
                    title="Reset zoom"
                  >
                    100%
                  </button>
                </>
              )}
            </div>

            <div className="flex-1" />

            {canRender && (
              <div className="flex items-center gap-2">
                <label className="text-sm opacity-80">Speed</label>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className="border rounded px-2 py-1 bg-gray-900"
                >
                  <option value={0.75}>0.75×</option>
                  <option value={1.0}>1.0×</option>
                  <option value={1.25}>1.25×</option>
                  <option value={1.5}>1.5×</option>
                  <option value={2.0}>2.0×</option>
                </select>
              </div>
            )}

            <button
              onClick={() => setIsOpen(false)}
              className="ml-2 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
              title="Hide whiteboard"
            >
              ✖
            </button>
          </div>

          {/* Chip for auto-refresh re-explain-on-page-change */}
          {showDetectedChip && (
            <div className="text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded inline-block">
              🧠 Diagram detected{typeof currentPage === "number" ? ` on p.${currentPage}` : ""} — refreshed
            </div>
          )}

          {/* Whiteboard stage (scaled wrapper + glow when new) */}
          {canRender ? (
            <motion.div
              ref={scrollRef}
              initial={false}
              animate={
                justGenerated
                  ? { boxShadow: "0 0 0 2px rgba(234,179,8,0.55), 0 0 30px rgba(234,179,8,0.25)" }
                  : { boxShadow: "0 0 0 1px rgba(55,65,81,0.7)" }
              }
              transition={{ duration: 0.35 }}
              className="relative rounded-lg bg-black/30 overflow-auto max-h-[70vh] border border-gray-800"
            >
              {/* The scale wrapper keeps your renderer untouched */}
              <div
                style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                className="origin-top-left inline-block"
              >
                <Whiteboard
                  steps={steps}
                  audioBlob={audioBlob ?? undefined}
                  narrationScript={narrationScript}
                  useAIVoice={!!audioBlob}
                  stickyNotes={stickyNotes}
                  lessonTitle={lessonTitle}
                  baseStepDurationMs={4000}
                  playbackSpeed={playbackSpeed}
                  /** 🔐 pass-through for persistence */
                  lessonId={lessonId}
                  userId={userId}
                />
              </div>
            </motion.div>
          ) : (
            <div className="text-sm text-gray-300/90 border border-dashed border-gray-700 rounded-lg p-3">
              {loading ? "Preparing whiteboard…" : "Click “Explain with Whiteboard” to generate."}
            </div>
          )}

          {/* Sticky notes */}
          {stickyNotes.length > 0 && (
            <div className="border p-3 rounded bg-yellow-50 text-sm text-gray-900">
              <h3 className="font-semibold mb-1">Sticky Notes</h3>
              <ul className="list-disc ml-5 space-y-1">
                {stickyNotes.map((note, idx) => (
                  <li key={idx}>
                    <strong>p.{note.pageNumber}:</strong> {note.content}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.aside>
      )}

      {/* Collapsed launcher */}
      {!isOpen && (
        <motion.button
          key="wb-open"
          initial={{ x: 12, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 12, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          onClick={() => setIsOpen(true)}
          className="self-end text-xs bg-yellow-500 text-black px-3 py-1 rounded shadow"
          title="Show whiteboard"
        >
          ✨ Whiteboard
        </motion.button>
      )}
    </AnimatePresence>
  );
}