// components/WhiteboardPanel.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WhiteboardStep } from "@/lib/WhiteboardExplanationService";
import Whiteboard, { type WhiteboardHandle } from "./Whiteboard";
import { Button } from "./ui/button";
import { AnimatePresence, motion } from "framer-motion";
import type { DiagramPlan } from "@/lib/whiteboard/diagramPlan";
import { buildNoteFromStudyModel, saveUltraNote } from "@/lib/notelab/ultraNoteStore";
import { buildRecallSetFromNote, saveRecallSet } from "@/lib/recalllab/recallStore";
import { saveStudyGuide } from "@/lib/studyguide/studyGuideStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";
import TeachingCanvas from "@/components/whiteboard/TeachingCanvas";
import RecallCanvas from "@/components/whiteboard/RecallCanvas";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import { deriveNoteCardsFromStudyModel } from "@/lib/notelab/deriveNoteCards";
import type { NoteSubject } from "@/lib/notelab/ultraNoteStore";

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

/** Image-generation provider (item 2 of the Whiteboard directive). */
type Provider = "openai" | "ideogram" | "sdxl" | "sdxlFineTuned";

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

  /** Full study model — passed to OpenAI for richer diagram generation */
  studyModel?: Record<string, unknown> | null;
  /** Raw page text top-to-bottom — passed to OpenAI for context */
  pageText?: string;

  /** Level 4 sync: called when the active Whiteboard step changes (fires with evidenceRefId or null) */
  onAnchorStep?: (anchorId: string | null) => void;
  /** Level 4 sync: when set, Whiteboard jumps to the step whose evidenceRefId matches */
  activeAnchorId?: string | null;

  /**
   * Debug mode (P3): when true, a failure in the new Whiteboard pipeline shows a
   * diagnostics panel (prompt, model, raw response, failure reason) instead of
   * silently rendering the generic buildFallbackSteps() content.
   * Defaults to NEXT_PUBLIC_WHITEBOARD_DEBUG === "1".
   */
  debugMode?: boolean;

  /** Recall tab metadata — passed through to RecallCanvas for saving sets */
  bookId?: string;
  bookTitle?: string;
  pageTitle?: string | null;
  knowledgeNodeId?: string | null;
  recallSubject?: NoteSubject;
};

type WhiteboardDebugInfo = {
  failureReason: string;
  model?: string;
  promptSent?: { system: string; user: string };
  rawResponse?: string;
  httpStatus?: number;
  error?: string;
};

type CachedPayload = { steps: WhiteboardStep[]; narrationScript: string; diagramPlan: DiagramPlan | null };

/** In-memory LRU-ish cache (oldest evicted on overflow) */
const memCache = new Map<
  string,
  { steps: WhiteboardStep[]; narrationScript: string; diagramPlan: DiagramPlan | null; audioDataUrl?: string }
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
  studyModel,
  pageText,
  onAnchorStep,
  activeAnchorId,
  debugMode,
  bookId,
  bookTitle,
  pageTitle,
  knowledgeNodeId,
  recallSubject,
}: Props) {
  const isDebugMode = debugMode ?? (process.env.NEXT_PUBLIC_WHITEBOARD_DEBUG === "1");
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<WhiteboardStep[]>([]);
  const [narrationScript, setNarrationScript] = useState("");
  const [diagramPlan, setDiagramPlan] = useState<DiagramPlan | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [wbProvider, setWbProvider] = useState<string>("unknown");
  const [debugInfo, setDebugInfo] = useState<WhiteboardDebugInfo | null>(null);

  // Single unified Whiteboard: the structured diagram (canvas) is always the
  // base layer; the AI illustration (when it succeeds) is an optional view on
  // top of it — never a separate tab the student has to pick.
  const [provider, setProvider] = useState<Provider>("openai");
  const [sdxlEndpoint, setSdxlEndpoint] = useState("");
  const [sdxlModelId, setSdxlModelId] = useState("");
  const [sdxlStylePreset, setSdxlStylePreset] = useState("");
  const [sdxlNegativePrompt, setSdxlNegativePrompt] = useState("");
  const [sdxlSeed, setSdxlSeed] = useState("");
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [aiImageUrl, setAiImageUrl] = useState<string | null>(null);
  const [aiTeachingScript, setAiTeachingScript] = useState("");
  const [aiImageError, setAiImageError] = useState<string | null>(null);
  const [aiImageDebugInfo, setAiImageDebugInfo] = useState<WhiteboardDebugInfo | null>(null);
  const [viewMode, setViewMode] = useState<"illustration" | "diagram">("diagram");
  const [showFallbackNote, setShowFallbackNote] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // ── Adaptive Teaching Engine tab state ───────────────────────────────────
  type WbTab = "teach" | "recall" | "diagram" | "illustration";
  const [wbTab, setWbTab] = useState<WbTab>("teach");
  // Guard: only request diagram generation once (lazy, on first Diagram tab open)
  const diagramRequestedRef = useRef(false);

  const teachNoteCards = useMemo((): NoteCard[] => {
    const sm = studyModel as any;
    if (!sm) return [];
    if (Array.isArray(sm.noteCards) && sm.noteCards.length > 0) return sm.noteCards as NoteCard[];
    try { return deriveNoteCardsFromStudyModel(sm as CurrentPageStudyModel); } catch { return []; }
  }, [studyModel]);

  // ✨ UX niceties (animation, zoom, cues)
  const [isOpen, setIsOpen] = useState(true);
  const [zoom, setZoom] = useState(0.95); // not "too zoomed" by default
  const [justGenerated, setJustGenerated] = useState(false); // brief glow when new steps land
  const [justDetected, setJustDetected] = useState(false);   // shows "Diagram detected" pill
  const [pulseExplain, setPulseExplain] = useState(false);   // pulse the button briefly when auto
  const [showDetectedChip, setShowDetectedChip] = useState(false); // your original chip (auto-refresh)
  const scrollRef = useRef<HTMLDivElement>(null);
  const whiteboardRef = useRef<WhiteboardHandle>(null);

  const debounceRef = useRef<number | null>(null);
  const lastCallTsRef = useRef<number>(0); // rate-limit

  const effectiveConcept = (concept || "").trim();
  const effectiveContext = (context || "").trim();

  /** Build stable cache key */
  const cacheKey = useMemo(() => {
    const sm = studyModel as any;
    const smKey = sm
      ? hashString([sm.pageThesis ?? "", sm.studyNotes?.keyMechanism ?? "", (sm.conceptBlocks?.length ?? 0).toString()].join("|"))
      : "no-model";
    const base = JSON.stringify({
      lessonId: lessonId || lessonTitle || "lesson",
      page: currentPage || 0,
      cHash: hashString(effectiveConcept),
      xHash: hashString(effectiveContext),
      smKey,
    });
    return `wb:${hashString(base)}`;
  }, [lessonId, lessonTitle, currentPage, effectiveConcept, effectiveContext, studyModel]);

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
  const tryLocalRestore = (): CachedPayload | null => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.steps && parsed?.narrationScript) {
        const plan: DiagramPlan | null = parsed.diagramPlan ?? null;
        setSteps(parsed.steps);
        setNarrationScript(parsed.narrationScript);
        setDiagramPlan(plan);
        if (parsed.audioDataUrl) {
          try {
            setAudioBlob(dataUrlToBlob(parsed.audioDataUrl));
          } catch {
            setAudioBlob(null);
          }
        } else {
          setAudioBlob(null);
        }
        return { steps: parsed.steps, narrationScript: parsed.narrationScript, diagramPlan: plan };
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  /** Write to both memory cache and localStorage (bounded) */
  const writeCache = (
    key: string,
    payload: { steps: WhiteboardStep[]; narrationScript: string; diagramPlan: DiagramPlan | null; audioBlob?: Blob | null },
  ) => {
    // memory
    memCache.set(key, {
      steps: payload.steps,
      narrationScript: payload.narrationScript,
      diagramPlan: payload.diagramPlan,
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
          diagramPlan: payload.diagramPlan,
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
  const tryCache = (): CachedPayload | null => {
    const memHit = memCache.get(cacheKey);
    if (memHit?.steps?.length) {
      setSteps(memHit.steps);
      setNarrationScript(memHit.narrationScript);
      setDiagramPlan(memHit.diagramPlan ?? null);
      setAudioBlob(null); // LS restore may set audio later if needed
      return { steps: memHit.steps, narrationScript: memHit.narrationScript, diagramPlan: memHit.diagramPlan ?? null };
    }
    return tryLocalRestore();
  };

  /** AI illustration (Phase 1 director script + Phase 2 image model) — runs in
   *  parallel with the always-present diagram, never gating it. Failure of any
   *  kind degrades silently: the diagram stays up, and (outside debug mode) a
   *  small auto-fading note is shown instead of a raw model error. */
  const generateAIDrawing = useCallback(async (plan: DiagramPlan | null) => {
    if (!effectiveConcept) return;
    setAiImageLoading(true);
    setAiImageError(null);
    setAiImageDebugInfo(null);
    try {
      const sdxlOptions = provider === "sdxl" || provider === "sdxlFineTuned"
        ? {
            endpoint: sdxlEndpoint || undefined,
            modelId: sdxlModelId || undefined,
            stylePreset: sdxlStylePreset || undefined,
            negativePrompt: sdxlNegativePrompt || undefined,
            seed: sdxlSeed ? Number(sdxlSeed) : undefined,
          }
        : undefined;

      const resp = await fetch("/api/whiteboard-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: effectiveConcept,
          context: effectiveContext,
          provider,
          debug: isDebugMode,
          diagramPlan: plan ?? undefined,
          sdxlOptions,
        }),
      });
      const data = await resp.json();

      if (data.error) {
        console.warn("[WHITEBOARD_IMAGE_CLIENT_FAILURE]", { provider, error: data.error, ...(data.debugInfo ?? {}) });
        setAiImageUrl(null);
        setAiTeachingScript("");
        if (isDebugMode && data.debugInfo) {
          setAiImageDebugInfo({ ...data.debugInfo, error: data.error });
        } else {
          setAiImageError(data.error);
          setShowFallbackNote(true);
          window.setTimeout(() => setShowFallbackNote(false), 3200);
        }
        return;
      }

      setAiImageUrl(data.imageUrl ?? null);
      setAiTeachingScript(data.teachingScript ?? "");
      setViewMode("illustration");
      console.log("[WHITEBOARD_IMAGE_READY_CLIENT]", { provider: data.provider, scriptChars: (data.teachingScript ?? "").length });
    } catch (err: any) {
      console.error("[WHITEBOARD_IMAGE_CLIENT_ERROR]", err);
      setAiImageUrl(null);
      setAiTeachingScript("");
      if (isDebugMode) {
        setAiImageDebugInfo({ failureReason: err?.message ?? String(err) });
      } else {
        setAiImageError(err?.message ?? "Something went wrong generating the drawing.");
        setShowFallbackNote(true);
        window.setTimeout(() => setShowFallbackNote(false), 3200);
      }
    } finally {
      setAiImageLoading(false);
    }
  }, [effectiveConcept, effectiveContext, provider, isDebugMode, sdxlEndpoint, sdxlModelId, sdxlStylePreset, sdxlNegativePrompt, sdxlSeed]);

  /** Core generate call — calls /api/whiteboard-explain with full studyModel + pageText context,
   *  then kicks off the (parallel, non-gating) AI illustration from the resulting diagramPlan. */
  const runGenerate = useCallback(async () => {
    if (!effectiveConcept && !studyModel) return;

    // rate-limit: 1 call / 3s
    const now = Date.now();
    if (now - lastCallTsRef.current < 3000) return;
    lastCallTsRef.current = now;

    // cache first
    console.log("[WHITEBOARD_CACHE_KEY]", { cacheKey, page: currentPage ?? null, hasModel: !!studyModel });
    const cached = tryCache();
    if (cached) {
      generateAIDrawing(cached.diagramPlan);
      return;
    }

    console.log("[WHITEBOARD_OPENAI_SOURCE]", {
      page: currentPage ?? null,
      hasConcept: !!effectiveConcept,
      hasStudyModel: !!studyModel,
      hasPageText: !!(pageText && pageText.length > 50),
      pageTextChars: pageText?.length ?? 0,
    });

    setLoading(true);
    try {
      const resp = await fetch("/api/whiteboard-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept:         effectiveConcept || null,
          context:         effectiveContext || null,
          studyModel:      studyModel ?? null,
          pageText:        (pageText ?? "").slice(0, 1500),
          debug:           isDebugMode,
          focusedAnchorId: activeAnchorId ?? null,
          pageNumber:      currentPage ?? null,
        }),
      });
      const data = await resp.json();

      // P3 debug mode: the new pipeline failed and returned diagnostics
      // instead of the silent buildFallbackSteps() fallback. Surface them —
      // do NOT render generic fallback content.
      if (isDebugMode && data.error && data.debugInfo) {
        console.error("[WHITEBOARD_DEBUG_FAILURE]", {
          page: currentPage ?? null,
          error: data.error,
          ...data.debugInfo,
        });
        setDebugInfo({ ...data.debugInfo, error: data.error });
        setSteps([]);
        setNarrationScript("");
        setDiagramPlan(data.diagramPlan ?? null);
        setAudioBlob(null);
        setWbProvider("debug-error");
        return;
      }
      setDebugInfo(null);

      const newSteps: WhiteboardStep[] = (data.steps ?? []).map((s: any) => ({
        title:       String(s?.title ?? "").trim(),
        description: String(s?.content ?? s?.description ?? "").trim(),
        type:        s?.type ?? "text",
        drawType:    s?.drawType ?? undefined,
        nodes:       Array.isArray(s?.nodes) ? s.nodes : undefined,
        arrows:      Array.isArray(s?.arrows) ? s.arrows : undefined,
        payload:     s?.payload ?? {},
      }));
      const narration: string = data.narrationScript ?? newSteps.map((s) => `${s.title}: ${s.description}`).join(" ");
      const plan: DiagramPlan | null = data.diagramPlan ?? null;

      setSteps(newSteps);
      setNarrationScript(narration);
      setDiagramPlan(plan);
      setAudioBlob(null);
      setWbProvider(data.provider ?? (data.aiDisabled ? "fallback" : "unknown"));

      // [DIAGNOSIS] Which provider generated these steps
      console.log("[WHITEBOARD_PROVIDER]", {
        page:          currentPage ?? null,
        provider:      data.provider ?? "unknown",   // "gemini" or "openai" set by whiteboard-explain.ts
        aiDisabled:    data.aiDisabled ?? false,
        stepCount:     newSteps.length,
        drawTypes:     newSteps.map((s: any) => s.drawType ?? "text"),
        hasDrawSteps:  newSteps.some((s: any) => s.type === "draw"),
        hasNodes:      newSteps.some((s: any) => Array.isArray(s.nodes) && s.nodes.length > 0),
        legacyPath:    data.aiDisabled === true,     // true = fallback text steps used
      });
      if (data.aiDisabled) {
        console.warn("[WHITEBOARD_LEGACY_PATH_USED]", {
          page: currentPage ?? null,
          reason: "aiDisabled=true — Gemini+OpenAI both failed or key missing; using buildFallbackSteps()",
        });
      }

      // Fetch OpenAI TTS for the narration so useAIVoice becomes true
      if (narration && !data.aiDisabled) {
        console.log("[WHITEBOARD_TTS_PROVIDER]", { page: currentPage ?? null, fetching: "/api/tts", narrationChars: narration.length, provider: "openai-tts-via-api" });
        fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: narration.slice(0, 3000), voice: "alloy", format: "mp3", return: "json" }),
        })
          .then((r) => r.json())
          .then((tts) => {
            if (tts?.audioBase64 && !tts?.useBrowserSpeech) {
              const mime = tts.mimeType || "audio/mpeg";
              const bin = atob(tts.audioBase64);
              const arr = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              const blob = new Blob([arr], { type: mime });
              setAudioBlob(blob);
              console.log("[WHITEBOARD_TTS_READY]", { narrationChars: narration.length, mimeType: mime, provider: "openai-tts" });
            } else {
              console.log("[WHITEBOARD_TTS_PROVIDER]", { result: tts?.useBrowserSpeech ? "browser-fallback" : "no-audio", reason: tts?.fallbackReason ?? "unknown" });
            }
          })
          .catch((err) => console.warn("[WHITEBOARD_TTS_ERROR]", err));
      } else if (data.aiDisabled) {
        console.log("[WHITEBOARD_TTS_PROVIDER]", { page: currentPage ?? null, result: "browser-speech-synthesis", reason: "aiDisabled — no API audio fetched" });
      }

      console.log("[WHITEBOARD_PLAN_CREATED]", {
        page: currentPage ?? null,
        stepCount: newSteps.length,
        drawTypes: newSteps.map((s) => (s as any).drawType ?? "text"),
        aiDisabled: data.aiDisabled ?? false,
      });

      console.log("[WHITEBOARD_DIAGRAM_STEPS_READY]", {
        page: currentPage ?? null,
        stepCount: newSteps.length,
        aiDisabled: data.aiDisabled ?? false,
        firstStep: newSteps[0]?.title ?? null,
      });

      // glow + scroll
      setJustGenerated(true);
      setTimeout(() => setJustGenerated(false), 1400);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }));

      writeCache(cacheKey, { steps: newSteps, narrationScript: narration, diagramPlan: plan, audioBlob: null });

      // Kick off the AI illustration in parallel — it never gates the diagram above.
      generateAIDrawing(plan);
    } catch (err) {
      console.error("[WHITEBOARD_GENERATE_ERROR]", err);
      setAudioBlob(null);
      setSteps([]);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, effectiveConcept, effectiveContext, studyModel, pageText, currentPage, activeAnchorId, isDebugMode, generateAIDrawing]);

  /** Manual trigger button */
  const handleExplainConcept = async () => {
    setShowDetectedChip(false); // manual run — hide chip
    await runGenerate();
  };

  /** Auto-trigger once on mount when studyModel is available, or when autoTrigger is set */
  useEffect(() => {
    if (studyModel) {
      // Study model path: Teach tab renders instantly from noteCards — defer
      // diagram generation to the first time the user opens the Diagram tab.
      console.log("[WHITEBOARD_STUDY_MODEL_READY]", {
        page: currentPage ?? null,
        hasThesis: !!(studyModel as any).pageThesis,
        hasKeyMechanism: !!(studyModel as any).studyNotes?.keyMechanism,
        conceptBlockCount: (studyModel as any).conceptBlocks?.length ?? 0,
      });
      return;
    }
    const shouldTrigger = autoTrigger && !!effectiveConcept && !!effectiveContext;
    if (!shouldTrigger) {
      // Bare concept (e.g. "Explain This Step → Visualize") — still generate illustration.
      if (effectiveConcept) generateAIDrawing(null);
      return;
    }
    setJustDetected(true);
    setPulseExplain(true);
    const t1 = setTimeout(() => setJustDetected(false), 2500);
    const t2 = setTimeout(() => setPulseExplain(false), 1400);
    runGenerate();
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only — studyModel/pageText changes are handled by page navigation remount

  /** Clear this panel's cache key from memCache on unmount (page changed → new key prop → remount) */
  useEffect(() => {
    return () => {
      memCache.delete(cacheKey);
      console.log("[WHITEBOARD_CLEAR_STALE]", { cacheKey, page: currentPage ?? null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const flashAction = (msg: string) => {
    setActionMessage(msg);
    window.setTimeout(() => setActionMessage(null), 2200);
  };

  /** Save to NoteLab — reuses the existing ultraNoteStore save path. */
  const handleSaveToNoteLab = async () => {
    if (!studyModel || !diagramPlan) return;
    try {
      const note = buildNoteFromStudyModel(studyModel as any, {
        bookId: lessonId ?? "book",
        pageNumber: diagramPlan.pageNumber ?? currentPage ?? 0,
        topic: diagramPlan.title,
      });
      await saveUltraNote(note);
      flashAction("✅ Saved to NoteLab");
    } catch (err) {
      console.error("[WHITEBOARD_SAVE_NOTELAB_ERROR]", err);
      flashAction("⚠ Could not save to NoteLab");
    }
  };

  /** Create Recall Card — reuses the existing recallStore save path. */
  const handleCreateRecallCard = async () => {
    if (!studyModel || !diagramPlan) return;
    try {
      const note = buildNoteFromStudyModel(studyModel as any, {
        bookId: lessonId ?? "book",
        pageNumber: diagramPlan.pageNumber ?? currentPage ?? 0,
        topic: diagramPlan.title,
      });
      const set = buildRecallSetFromNote(note);
      await saveRecallSet(set);
      flashAction("✅ Recall card created");
    } catch (err) {
      console.error("[WHITEBOARD_RECALL_CARD_ERROR]", err);
      flashAction("⚠ Could not create recall card");
    }
  };

  /** Add to Study Guide — builds a minimal record directly from the DiagramPlan. */
  const handleAddToStudyGuide = async () => {
    if (!diagramPlan) return;
    try {
      const record: StudyGuideRecord = {
        id: `sg-${lessonId ?? "book"}-${diagramPlan.pageNumber ?? "p"}-${Date.now()}`,
        bookId: lessonId ?? "book",
        mode: "visual",
        chapterTitle: diagramPlan.title,
        topic: diagramPlan.title,
        priority: "Medium",
        mustKnow: [],
        datFacts: [],
        mechanisms: diagramPlan.steps.map((s) => ({ title: s.title, steps: [s.content] })),
        traps: diagramPlan.warnings,
        recallQuestions: [],
        memoryHooks: diagramPlan.memoryHooks,
        dailyTasks: [],
        sourceLabels: ["Whiteboard"],
        createdAt: Date.now(),
      };
      await saveStudyGuide(record);
      flashAction("✅ Added to Study Guide");
    } catch (err) {
      console.error("[WHITEBOARD_STUDYGUIDE_ERROR]", err);
      flashAction("⚠ Could not add to Study Guide");
    }
  };

  const handleExportPNG = () => whiteboardRef.current?.exportPNG();
  const handleExportPDF = () => whiteboardRef.current?.exportPDF();

  /** Regenerate — bypass the cache and re-run both the diagram + illustration calls. */
  const handleRegenerate = () => {
    memCache.delete(cacheKey);
    try { localStorage.removeItem(cacheKey); } catch { /* ignore */ }
    setAiImageUrl(null);
    setAiImageError(null);
    setAiTeachingScript("");
    runGenerate();
  };

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
          {/* ── Adaptive Teaching Engine: mode tabs ─────────────────────── */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            {(
              [
                ["teach",        "📚 Teach"],
                ["recall",       "🎯 Recall"],
                ["diagram",      "✏️ Diagram"],
                ["illustration", "🖼 Illustration"],
              ] as [WbTab, string][]
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setWbTab(tab);
                  if (tab === "diagram" && !diagramRequestedRef.current && !steps.length) {
                    diagramRequestedRef.current = true;
                    runGenerate();
                  }
                }}
                style={{
                  flex: 1, padding: "10px 4px", fontSize: 11,
                  fontWeight: wbTab === tab ? 700 : 500,
                  background: "transparent",
                  color: wbTab === tab ? "#fcd34d" : "rgba(148,163,184,0.5)",
                  borderBottom: `2px solid ${wbTab === tab ? "#fcd34d" : "transparent"}`,
                  border: "none",
                  cursor: "pointer",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Teach tab: instant sequential teaching frames ─────────────── */}
          {wbTab === "teach" && (
            <TeachingCanvas
              pageTitle={(studyModel as any)?.pageThesis ?? lessonTitle}
              noteCards={teachNoteCards}
            />
          )}

          {/* ── Recall tab: flip-card session from the same teaching sequence ── */}
          {wbTab === "recall" && (
            <RecallCanvas
              noteCards={teachNoteCards}
              pageTitle={pageTitle ?? (studyModel as any)?.pageThesis ?? lessonTitle}
              bookId={bookId}
              bookTitle={bookTitle}
              pageNumber={currentPage}
              knowledgeNodeId={knowledgeNodeId}
              subject={recallSubject}
            />
          )}

          {/* ── Diagram + Illustration tabs: existing panel content ─────── */}
          {wbTab !== "teach" && wbTab !== "recall" && (
            <>

          {/* Header / Controls */}
          <div className="flex items-center gap-2 flex-wrap relative">
            {/* "Diagram detected" pill (auto-trigger cue) */}
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
                <Button onClick={handleExplainConcept} disabled={loading || (!effectiveConcept && !studyModel)}>
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

            {/* Illustration ready chip — prompts the user to switch to the Illustration tab */}
            {aiImageUrl && wbTab !== "illustration" && (
              <div
                onClick={() => setWbTab("illustration")}
                style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}
              >
                🖼 Illustration ready
              </div>
            )}

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

          {/* Provider badge — warns when AI unavailable and generic fallback is shown */}
          {canRender && wbProvider === "fallback" && (
            <div className="text-xs bg-red-900/60 text-red-300 border border-red-700/50 px-2 py-1 rounded inline-flex items-center gap-1">
              ⚠ FALLBACK — AI unavailable, showing generic diagram
            </div>
          )}

          {/* P3 debug panel — shown instead of the silent fallback when debugMode is on
              and the new Whiteboard pipeline failed. */}
          {isDebugMode && debugInfo && (
            <div className="text-xs bg-red-950/60 text-red-200 border border-red-800/60 rounded-lg p-3 space-y-2">
              <div className="font-semibold text-red-300">
                ⚠ Whiteboard pipeline failed — debug mode (no silent fallback)
              </div>
              <div><span className="text-red-400">Failure reason:</span> {debugInfo.failureReason}</div>
              {debugInfo.error && (
                <div><span className="text-red-400">Error:</span> {debugInfo.error}</div>
              )}
              {typeof debugInfo.httpStatus === "number" && (
                <div><span className="text-red-400">HTTP status:</span> {debugInfo.httpStatus}</div>
              )}
              {debugInfo.model && (
                <div><span className="text-red-400">Model:</span> {debugInfo.model}</div>
              )}
              <div><span className="text-red-400">Selected text / concept:</span> {effectiveConcept || "(none)"}</div>
              <div><span className="text-red-400">Page context:</span> {effectiveContext || "(none)"}</div>
              {debugInfo.promptSent && (
                <details>
                  <summary className="cursor-pointer text-red-400">Prompt sent</summary>
                  <pre className="whitespace-pre-wrap mt-1 max-h-48 overflow-auto bg-black/30 p-2 rounded">
{`SYSTEM:\n${debugInfo.promptSent.system}\n\nUSER:\n${debugInfo.promptSent.user}`}
                  </pre>
                </details>
              )}
              {debugInfo.rawResponse && (
                <details>
                  <summary className="cursor-pointer text-red-400">Raw model/API response</summary>
                  <pre className="whitespace-pre-wrap mt-1 max-h-48 overflow-auto bg-black/30 p-2 rounded">
{debugInfo.rawResponse}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Generating-illustration chip — non-blocking, the diagram below stays interactive */}
          {aiImageLoading && (
            <div className="text-xs bg-blue-900/40 text-blue-300 border border-blue-700/40 px-2 py-1 rounded inline-flex items-center gap-1 w-fit">
              ✨ Generating illustration…
            </div>
          )}

          {/* Silent-fallback note — only shown briefly, outside debug mode, when the
              illustration failed. The diagram above is already visible — never blank,
              never a raw model error. */}
          <AnimatePresence>
            {showFallbackNote && !isDebugMode && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs bg-gray-800/70 text-gray-300 px-2 py-1 rounded inline-block w-fit"
              >
                Generated as structured diagram
              </motion.div>
            )}
          </AnimatePresence>

          {/* Debug panel — illustration failure with diagnostics instead of silent fallback */}
          {isDebugMode && aiImageDebugInfo && (
            <div className="text-xs bg-red-950/60 text-red-200 border border-red-800/60 rounded-lg p-3 space-y-2">
              <div className="font-semibold text-red-300">
                ⚠ AI illustration failed — debug mode (no silent fallback)
              </div>
              <div><span className="text-red-400">Failure reason:</span> {aiImageDebugInfo.failureReason}</div>
              {aiImageDebugInfo.error && (
                <div><span className="text-red-400">Error:</span> {aiImageDebugInfo.error}</div>
              )}
              {typeof aiImageDebugInfo.httpStatus === "number" && (
                <div><span className="text-red-400">HTTP status:</span> {aiImageDebugInfo.httpStatus}</div>
              )}
              {aiImageDebugInfo.model && (
                <div><span className="text-red-400">Model:</span> {aiImageDebugInfo.model}</div>
              )}
              <div><span className="text-red-400">Provider:</span> {provider}</div>
              <div><span className="text-red-400">Concept:</span> {effectiveConcept || "(none)"}</div>
              {aiImageDebugInfo.promptSent && (
                <details>
                  <summary className="cursor-pointer text-red-400">Prompt sent</summary>
                  <pre className="whitespace-pre-wrap mt-1 max-h-48 overflow-auto bg-black/30 p-2 rounded">
{`SYSTEM:\n${aiImageDebugInfo.promptSent.system}\n\nUSER:\n${aiImageDebugInfo.promptSent.user}`}
                  </pre>
                </details>
              )}
              {aiImageDebugInfo.rawResponse && (
                <details>
                  <summary className="cursor-pointer text-red-400">Raw model/API response</summary>
                  <pre className="whitespace-pre-wrap mt-1 max-h-48 overflow-auto bg-black/30 p-2 rounded">
{aiImageDebugInfo.rawResponse}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Illustration view — shown only on Illustration tab */}
          <div style={{ display: aiImageUrl && wbTab === "illustration" ? "block" : "none" }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-lg border border-gray-800 bg-black/30 overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aiImageUrl ?? undefined} alt={effectiveConcept || "AI-generated whiteboard drawing"} className="w-full max-h-[60vh] object-contain bg-white" />
              {aiTeachingScript && (
                <details className="text-xs text-gray-300/90 p-3 border-t border-gray-800">
                  <summary className="cursor-pointer opacity-80">Visual teaching script</summary>
                  <pre className="whitespace-pre-wrap mt-2">{aiTeachingScript}</pre>
                </details>
              )}
            </motion.div>
          </div>

          {/* Diagram (canvas) view — shown on Diagram tab */}
          <div style={{ display: wbTab === "diagram" ? "block" : "none" }}>
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
                  style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: 900 }}
                  className="origin-top-left"
                >
                  <Whiteboard
                    ref={whiteboardRef}
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
                    onAnchorStep={onAnchorStep}
                    activeAnchorId={activeAnchorId}
                  />
                </div>
              </motion.div>
            ) : !(isDebugMode && debugInfo) ? (
              <div className="text-sm text-gray-300/90 border border-dashed border-gray-700 rounded-lg p-3">
                {loading
                  ? "Preparing whiteboard…"
                  : !studyModel && !effectiveConcept
                  ? "⏳ Whiteboard waiting for current page study model."
                  : "Click 'Explain with Whiteboard' to generate."}
              </div>
            ) : null}
          </div>

          {/* Model/provider selector + integration controls — Illustration tab only */}
          <div className="flex flex-col gap-2 border-t border-gray-800 pt-2">
            {wbTab === "illustration" && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs opacity-80">Image provider</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as Provider)}
                    className="border rounded px-2 py-1 bg-gray-900 text-xs"
                  >
                    <option value="openai">OpenAI Images (anatomy / biology / chemistry / dental)</option>
                    <option value="ideogram">Ideogram (text-heavy labeled diagrams)</option>
                    <option value="sdxl">Stable Diffusion XL</option>
                    <option value="sdxlFineTuned">Fine-tuned SDXL</option>
                    <option value="leonardo" disabled>Leonardo AI (coming soon)</option>
                  </select>
                  <Button onClick={() => generateAIDrawing(diagramPlan)} disabled={aiImageLoading || !effectiveConcept}>
                    {aiImageLoading ? "Drawing..." : "🖌️ Generate Illustration"}
                  </Button>
                </div>

                {(provider === "sdxl" || provider === "sdxlFineTuned") && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <input placeholder="Endpoint URL" value={sdxlEndpoint} onChange={(e) => setSdxlEndpoint(e.target.value)} className="border rounded px-2 py-1 bg-gray-900 w-48" />
                    <input placeholder="Model ID" value={sdxlModelId} onChange={(e) => setSdxlModelId(e.target.value)} className="border rounded px-2 py-1 bg-gray-900 w-40" />
                    <input placeholder="Style preset" value={sdxlStylePreset} onChange={(e) => setSdxlStylePreset(e.target.value)} className="border rounded px-2 py-1 bg-gray-900 w-32" />
                    <input placeholder="Negative prompt" value={sdxlNegativePrompt} onChange={(e) => setSdxlNegativePrompt(e.target.value)} className="border rounded px-2 py-1 bg-gray-900 w-48" />
                    <input placeholder="Seed" value={sdxlSeed} onChange={(e) => setSdxlSeed(e.target.value)} className="border rounded px-2 py-1 bg-gray-900 w-20" />
                  </div>
                )}
              </>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={handleExportPNG} disabled={!canRender} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">
                🖼 Export PNG
              </button>
              <button onClick={handleExportPDF} disabled={!canRender} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">
                🧾 Export PDF
              </button>
              <button onClick={handleRegenerate} disabled={loading || aiImageLoading} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">
                🔄 Regenerate
              </button>
            </div>
          </div>

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

            </> /* end wbTab !== "teach" wrapper */
          )}

          {/* Integration buttons — visible in all tabs */}
          <div className="flex items-center gap-2 flex-wrap border-t border-gray-800 pt-2">
            <button onClick={handleSaveToNoteLab} disabled={!studyModel || !diagramPlan} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">
              📓 Save to NoteLab
            </button>
            <button onClick={handleCreateRecallCard} disabled={!studyModel || !diagramPlan} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">
              🧠 Create Recall Card
            </button>
            <button onClick={handleAddToStudyGuide} disabled={!diagramPlan} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">
              📘 Add to Study Guide
            </button>
            {actionMessage && <span className="text-xs text-emerald-300">{actionMessage}</span>}
          </div>

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
