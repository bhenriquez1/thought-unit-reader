// components/WhiteboardPanel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { WhiteboardStep } from "@/lib/WhiteboardExplanationService";
import Whiteboard from "./Whiteboard";
import { Button } from "./ui/button";

/** Simple, fast hash for cache keys */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/** Default lightweight diagram/formula heuristic (can be overridden) */
function defaultDiagramHeuristic(text: string): boolean {
  const t = text.toLowerCase();
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
}: Props) {
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<WhiteboardStep[]>([]);
  const [narrationScript, setNarrationScript] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showDetectedChip, setShowDetectedChip] = useState(false);

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
        }
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  };

  /** Convert a data: URL back to Blob */
  function dataUrlToBlob(dataUrl: string): Blob {
    const [hdr, b64] = dataUrl.split(",");
    const mime = /data:(.*?);base64/.exec(hdr)?.[1] || "audio/mpeg";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /** Write to both memory cache and localStorage (bounded) */
  const writeCache = (key: string, payload: { steps: WhiteboardStep[]; narrationScript: string; audioBlob?: Blob | null }) => {
    // memory
    memCache.set(key, {
      steps: payload.steps,
      narrationScript: payload.narrationScript,
      audioDataUrl: payload.audioBlob ? "" : undefined, // will be set from LS, we keep mem lean
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
      });
    } catch {
      /* ignore localStorage quota errors */
    }
  };

  function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  /** Try a cache hit (mem → local) */
  const tryCache = (): boolean => {
    const memHit = memCache.get(cacheKey);
    if (memHit?.steps?.length) {
      setSteps(memHit.steps);
      setNarrationScript(memHit.narrationScript);
      // audio kept only in LS to keep mem tiny; LS restore happens separately if needed
      setAudioBlob(null);
      return true;
    }
    return tryLocalRestore();
  };

  /** Core generate call (with cache + state wiring) */
  const runGenerate = async () => {
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

      writeCache(cacheKey, {
        steps: result.steps,
        narrationScript: result.narrationScript,
        audioBlob: result.audioBlob ?? null,
      });
    } catch (err) {
      console.error("Error generating explanation:", err);
      setAudioBlob(null);
    } finally {
      setLoading(false);
    }
  };

  /** Manual trigger button */
  const handleExplainConcept = async () => {
    setShowDetectedChip(false); // manual run — hide chip
    await runGenerate();
  };

  /** Auto-trigger once on mount if requested */
  useEffect(() => {
    if (autoTrigger && effectiveConcept && effectiveContext) {
      runGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger]);

  /** NEW: auto re-explain when page changes (debounced + heuristic) */
  useEffect(() => {
    if (!reExplainOnPageChange) return;
    if (!effectiveConcept || !effectiveContext) return;

    // Only proceed if the concept *looks* diagram-ish (cheap guard)
    if (!containsDiagramOrFormula(effectiveConcept)) return;

    // Debounce ~600ms so rapid paging doesn’t spam
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

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <Button onClick={handleExplainConcept} disabled={loading || !effectiveConcept}>
          {loading ? "Generating..." : "🎓 Explain with Whiteboard"}
        </Button>

        {steps.length > 0 && (
          <>
            <label className="ml-2 text-sm opacity-80">Speed</label>
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              className="border rounded px-2 py-1"
            >
              <option value={0.75}>0.75×</option>
              <option value={1.0}>1.0×</option>
              <option value={1.25}>1.25×</option>
              <option value={1.5}>1.5×</option>
              <option value={2.0}>2.0×</option>
            </select>
          </>
        )}

        {showDetectedChip && (
          <span className="ml-2 text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded">
            🧠 Diagram detected{typeof currentPage === "number" ? ` on p.${currentPage}` : ""} — refreshed
          </span>
        )}
      </div>

      {steps.length > 0 && (
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
      )}

      {stickyNotes.length > 0 && (
        <div className="border p-3 rounded bg-yellow-50 text-sm">
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
    </div>
  );
}