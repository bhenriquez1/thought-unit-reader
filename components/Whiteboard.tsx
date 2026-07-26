// components/Whiteboard.tsx
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { WhiteboardStep } from "@/lib/WhiteboardExplanationService";
import {
  subscribeStepNotes,
  addStepNote,
  updateStepNote,
  deleteStepNote,
  type StepNote as PersistedStepNote,
} from "@/lib/StickyNoteService";
import { SmartDrawingEngine, type DrawingState, type SmartSuggestion } from "@/lib/smartDrawingEngine";
import {
  claimSpeech,
  isSpeechStale,
  registerActiveAudio,
  registerActiveUtterance,
  notifySpeechStart,
  notifySpeechEnd,
  notifySpeechError,
  logBlockedDuplicate,
} from "@/lib/speech/speechController";

const DEV = process.env.NODE_ENV === "development";

const SPEECH_OWNER = "whiteboard" as const;

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

// Lightweight sticky note shape used only for exports right now
type StickyNoteLite = { pageNumber: number; content: string };
// In-session/UI note shape (we’ll store the persisted rows in this shape)
type StepNote = { id: string; step: number; content: string; userId?: string };

interface WhiteboardProps {
  steps: WhiteboardStep[];
  audioBlob?: Blob | null;
  /** If true, play provided audioBlob; if false, use browser TTS on narrationScript */
  useAIVoice?: boolean;
  /** Used when useAIVoice === false */
  narrationScript?: string;
  /** Base ms per step at 1.0x (fallback when no AI audio duration) */
  baseStepDurationMs?: number;
  /** Optional: include sticky notes in exported lesson */
  stickyNotes?: StickyNoteLite[];
  /** Optional: title for exports */
  lessonTitle?: string;
  /** Optional parent-controlled playback speed (overrides internal control if provided) */
  playbackSpeed?: number;

  /** 🔐 Persistence (optional). If omitted, overlay still works in-memory. */
  lessonId?: string;   // e.g. document id or slug
  userId?: string;     // current user id (if available)
  
  /** Enhanced drawing capabilities */
  enableDrawing?: boolean;
  concept?: string;
  context?: string;

  /** Called when the active step changes — fires with the step's evidenceRefId (or null) */
  onAnchorStep?: (anchorId: string | null) => void;
  /** When set, Whiteboard jumps to the step whose evidenceRefId matches */
  activeAnchorId?: string | null;
}

export interface WhiteboardHandle {
  exportPDF: () => Promise<void>;
  exportPNG: () => void;
}

/* ------------------------------------------------------------------ */
/* Animation constants                                                */
/* ------------------------------------------------------------------ */

const CANVAS_W = 900;
const CANVAS_H = 460;
const PADDING_X = 24;
const TITLE_Y = 40;
const DESC_Y = 80;
const DESC_LINE_H = 26;

const TITLE_FADE_MS = 450; // fade in title at the start of each step
const UNDERLINE_MS  = 600; // scribble underline draw time
const MIN_STEP_MS   = 1200; // minimum step length for animation
const BOUNDARY_FRESHNESS_MS = 1500; // how long a speechSynthesis onboundary event stays trusted before falling back to the wall-clock estimate

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

const Whiteboard = forwardRef<WhiteboardHandle, WhiteboardProps>(function Whiteboard({
  steps,
  audioBlob = null,
  useAIVoice = false,
  narrationScript = "",
  baseStepDurationMs = 4000,
  stickyNotes = [],
  lessonTitle = "Whiteboard Lesson",
  playbackSpeed, // parent may control speed
  lessonId,
  userId,
  enableDrawing = true,
  concept = "",
  context = "",
  onAnchorStep,
  activeAnchorId,
}, ref) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // True once paused mid-playback — drives Play vs Resume so a paused-at-step-0
  // session resumes the existing utterance instead of restarting from elapsed=0.
  const [hasPaused, setHasPaused] = useState(false);

  // Internal speed UI (used when parent doesn't provide playbackSpeed)
  const [localSpeed, setLocalSpeed] = useState<number>(1.0);
  const effectiveSpeed = playbackSpeed ?? localSpeed;

  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [audioDurationSec, setAudioDurationSec] = useState<number | null>(null);

  // 🔔 Cues + totalMs for syncing steps to narration
  const [cues, setCues] = useState<number[]>([]); // ms start times per step
  const [totalMs, setTotalMs] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const globalTokenRef = useRef(0);
  const isStartingRef = useRef(false);
  
  // Enhanced drawing functionality
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawingEngine, setDrawingEngine] = useState<SmartDrawingEngine | null>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([]);
  const [currentDrawingTool, setCurrentDrawingTool] = useState<'pen' | 'highlighter' | 'eraser' | 'shape' | 'text' | 'smart-suggest'>('pen');
  const [drawingColor, setDrawingColor] = useState('#2563eb');
  const [drawingWidth, setDrawingWidth] = useState(2);

  // For TTS/silent fallback: track elapsed time across play/pause
  const ttsStartRef = useRef<number | null>(null);
  const ttsElapsedRef = useRef<number>(0);
  const ttsTimerRef = useRef<number | null>(null);
  // Real per-character progress from the browser TTS engine's own boundary
  // events — far more accurate than the flat-wpm wall-clock estimate below.
  // Null/stale (no boundary in the last BOUNDARY_FRESHNESS_MS) means the
  // browser never fired one (e.g. Safari), so we fall back to wall-clock.
  const lastBoundaryRef = useRef<{ frac: number; atMs: number } | null>(null);

  // Canvas animation loop
  const rafRef = useRef<number | null>(null);

  // Tracks when a step change is driven by activeAnchorId (external) so we don't echo it back
  const externalJumpRef = useRef(false);

  // ── Whiteboard → PDF: notify parent when active step changes ──────────────
  useEffect(() => {
    if (externalJumpRef.current) { externalJumpRef.current = false; return; }
    const anchorId = steps[currentStepIndex]?.evidenceRefId ?? null;
    onAnchorStep?.(anchorId ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepIndex]);

  // ── PDF → Whiteboard: jump to the step matching the focused PDF anchor ────
  useEffect(() => {
    if (!activeAnchorId) return;
    const idx = steps.findIndex((s) => s.evidenceRefId === activeAnchorId);
    if (idx >= 0 && idx !== currentStepIndex) {
      externalJumpRef.current = true;
      setCurrentStepIndex(idx);
      DEV && console.log("[WHITEBOARD_ANCHOR_JUMP]", { activeAnchorId, idx, title: steps[idx]?.title });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAnchorId]);

  // 🔶 Sticky-notes overlay (per step) — persisted via StickyNoteService
  const [stepNotes, setStepNotes] = useState<StepNote[]>([]);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<StepNote | null>(null);
  const [noteText, setNoteText] = useState("");

  // Initialize drawing engine when canvas is ready
  useEffect(() => {
    if (!enableDrawing || !drawingCanvasRef.current || drawingEngine) return;

    const engine = new SmartDrawingEngine(drawingCanvasRef.current);
    setDrawingEngine(engine);
  }, [enableDrawing, drawingCanvasRef, drawingEngine]);

  // Initialize/re-sync semantic context whenever the engine is (re)created or
  // the active concept/page changes — without this, the drawing engine kept
  // analyzing the previous page's concept/text and offered stale "smart
  // suggestions" after navigating to a new page.
  useEffect(() => {
    if (!drawingEngine || !concept || !context) return;
    drawingEngine.initializeSemanticContext(context, [concept]);
  }, [drawingEngine, concept, context]);

  // Update smart suggestions when drawing engine changes
  useEffect(() => {
    if (!drawingEngine) return;
    
    const updateSuggestions = () => {
      setSmartSuggestions(drawingEngine.getSuggestions());
    };
    
    // Update suggestions periodically
    const interval = setInterval(updateSuggestions, 2000);
    return () => clearInterval(interval);
  }, [drawingEngine]);

  // Handle drawing tool changes
  const handleToolChange = (tool: typeof currentDrawingTool) => {
    setCurrentDrawingTool(tool);
    if (drawingEngine) {
      drawingEngine.setTool(tool);
    }
  };

  const handleColorChange = (color: string) => {
    setDrawingColor(color);
    if (drawingEngine) {
      drawingEngine.setColor(color);
    }
  };

  const handleWidthChange = (width: number) => {
    setDrawingWidth(width);
    if (drawingEngine) {
      drawingEngine.setWidth(width);
    }
  };

  const clearDrawing = () => {
    if (drawingEngine) {
      drawingEngine.clear();
    }
  };

  const undoDrawing = () => {
    if (drawingEngine) {
      drawingEngine.undo();
    }
  };

  const applySuggestion = (suggestion: SmartSuggestion) => {
    suggestion.action();
    setSmartSuggestions(drawingEngine?.getSuggestions() || []);
  };

  // 🔌 Online/local-only indicator
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  /** Subscribe to persisted step notes when lessonId is provided */
  useEffect(() => {
    if (!lessonId) return; // in-memory-only mode
    let unsub: undefined | (() => void);
    (async () => {
      unsub = await subscribeStepNotes(
        lessonId,
        { userId },
        (rows: PersistedStepNote[]) => {
          const mapped: StepNote[] = rows.map((r) => ({
            id: r.id,
            step: r.step ?? 0,
            content: r.content ?? "",
            userId: r.userId,
          }));
          setStepNotes(mapped);
        }
      );
    })();
    return () => {
      if (unsub) unsub();
    };
  }, [lessonId, userId]);

  /** Build object URL for AI audio */
  useEffect(() => {
    if (!audioBlob || !useAIVoice) {
      setAudioURL(null);
      setAudioDurationSec(null);
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    setAudioURL(url);
    return () => URL.revokeObjectURL(url);
  }, [audioBlob, useAIVoice]);

  /** Load audio duration for step timing when using AI audio */
  useEffect(() => {
    if (!useAIVoice || !audioRef.current) return;
    const el = audioRef.current;

    const handleLoaded = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setAudioDurationSec(el.duration);
      }
    };
    el.addEventListener("loadedmetadata", handleLoaded);
    el.addEventListener("durationchange", handleLoaded);
    return () => {
      el.removeEventListener("loadedmetadata", handleLoaded);
      el.removeEventListener("durationchange", handleLoaded);
    };
  }, [useAIVoice, audioURL]);

  /** Compute cues (ms per step) using either AI audio duration or estimated TTS/silent duration */
  useEffect(() => {
    if (steps.length === 0) {
      setCues([]);
      setTotalMs(0);
      return;
    }

    const wordsPerStep = steps.map(
      (s) => (s.description || "").trim().split(/\s+/).filter(Boolean).length || 1
    );
    const sumWords = wordsPerStep.reduce((a, b) => a + b, 0);

    let total: number;
    if (useAIVoice && audioDurationSec) {
      total = audioDurationSec * 1000;
    } else {
      const trimmed = (narrationScript || "").trim();
      const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
      // Fallback even if there is no TTS narrationScript
      total =
        wordCount > 0
          ? (wordCount / 160) * 60_000
          : Math.max(MIN_STEP_MS * steps.length, steps.length * baseStepDurationMs);
    }

    let acc = 0;
    const starts = wordsPerStep.map((w) => {
      const start = acc;
      acc += (w / Math.max(1, sumWords)) * total;
      return start;
    });

    setCues(starts);
    setTotalMs(total);
  }, [steps, useAIVoice, audioDurationSec, narrationScript, baseStepDurationMs]);

  /* ------------------------------------------------------------------ */
  /* Drawing + animation (RAF)                                          */
  /* ------------------------------------------------------------------ */

  // Draw wrapped words – strictly limit to `visibleWords` across lines
  function drawWrappedWords(
    ctx: CanvasRenderingContext2D,
    words: string[],
    visibleWords: number,
    x: number,
    y: number,
    maxWidth: number,
    lineH: number
  ) {
    const display = words.slice(0, Math.max(0, visibleWords));
    let line = "";

    for (let i = 0; i < display.length; i++) {
      const word = display[i];
      const test = line ? `${line} ${word}` : word;
      const w = ctx.measureText(test).width;
      if (w > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineH;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
  }

  /** Animated underline that looks a bit hand-drawn */
  function drawScribbleUnderline(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    p: number // 0..1
  ) {
    const segments = Math.max(8, Math.floor(w / 24));
    const drawn = Math.floor(segments * p);
    const amp = 1.8;

    ctx.save();
    ctx.strokeStyle = "#f59e0b"; // amber-500
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= drawn; i++) {
      const t = i / segments;
      const xx = x + w * t;
      const yy = y + Math.sin(t * Math.PI * 2) * amp;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Baseline draw (called every frame)
  const drawStep = (ctx: CanvasRenderingContext2D, progressWithinStep: number) => {
    const canvas = ctx.canvas;
    const step = steps[currentStepIndex] || { title: "", description: "" };

    // bg — dark chalkboard
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw previous steps' diagram elements cumulatively (Armando-style persistence)
    for (let si = 0; si < currentStepIndex; si++) {
      const ps = steps[si] as any;
      if (ps?.nodes?.length > 0) {
        drawDiagramNodes(ctx, ps.nodes, ps.arrows, ps.drawType, 1.0);
      }
    }

    // Title fade-in
    const title = step.title || `Step ${currentStepIndex + 1}`;
    ctx.font = "bold 22px Arial";
    const titleWidth = Math.min(CANVAS_W - 2 * PADDING_X, ctx.measureText(title).width);

    const stepMs = stepWindowMs();
    const titleAlpha = easeOutCubic(Math.min(1, (progressWithinStep * stepMs) / TITLE_FADE_MS));
    ctx.save();
    ctx.globalAlpha = titleAlpha;
    ctx.fillStyle = "#f9fafb";
    ctx.fillText(title, PADDING_X, TITLE_Y);
    ctx.restore();

    // Scribble underline
    const underlineP = Math.min(1, (progressWithinStep * stepMs) / UNDERLINE_MS);
    drawScribbleUnderline(ctx, PADDING_X, TITLE_Y + 6, titleWidth + 8, underlineP);

    // Description — animated word reveal
    const desc = step.description || "";
    ctx.font = "18px Arial";
    ctx.fillStyle = "#e2e8f0";
    const words = desc.trim().length ? desc.trim().split(/\s+/) : [];

    // reveal pacing: most of the step duration
    const revealMs = Math.max(MIN_STEP_MS * 0.8, stepMs * 0.9);
    const revealRatio = isPlaying ? clamp((progressWithinStep * stepMs) / revealMs, 0, 1) : 1;
    const visibleWords = Math.max(0, Math.floor(words.length * revealRatio));

    drawWrappedWords(ctx, words, visibleWords, PADDING_X, DESC_Y, CANVAS_W - 2 * PADDING_X, DESC_LINE_H);

    // Visual prompt hint
    if ((step as any).visualPrompt) {
      ctx.font = "italic 16px Arial";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`(Draw: ${(step as any).visualPrompt})`, PADDING_X, canvas.height - 24);
    }

    // ── Current step diagram rendering (animated alpha) ──────────────────
    const nodes = (step as any).nodes as Array<{ id: string; label: string; nx?: number; ny?: number }> | undefined;
    const arrows = (step as any).arrows as Array<{ from: string; to: string; label?: string }> | undefined;
    const drawType = (step as any).drawType as string | undefined;

    if (nodes && nodes.length > 0) {
      const diagramAlpha = easeOutCubic(Math.min(1, Math.max(0, (progressWithinStep * stepWindowMs() - 400) / 600)));
      if (diagramAlpha > 0) {
        drawDiagramNodes(ctx, nodes, arrows, drawType, diagramAlpha);
      }
    }
    // ── End diagram rendering ────────────────────────────────────────────
  };

  /** Shared helper: draw nodes + arrows for one step's data at a given alpha */
  function drawDiagramNodes(
    ctx: CanvasRenderingContext2D,
    nodes: Array<{ id: string; label: string; nx?: number; ny?: number }>,
    arrows: Array<{ from: string; to: string; label?: string }> | undefined,
    drawType: string | undefined,
    alpha: number,
  ) {
    const canvas = ctx.canvas;
    const DIAGRAM_TOP  = DESC_Y + 60;
    const DIAGRAM_W    = CANVAS_W - 2 * PADDING_X;
    const DIAGRAM_H    = canvas.height - DIAGRAM_TOP - 30;
    const NODE_W = 140;
    const NODE_H = 38;

    type NodePos = { id: string; x: number; y: number; label: string };
    let positions: NodePos[];

    if (nodes.every(n => n.nx != null && n.ny != null)) {
      positions = nodes.map(n => ({
        id: n.id, label: n.label,
        x: PADDING_X + (n.nx ?? 0.5) * DIAGRAM_W,
        y: DIAGRAM_TOP + (n.ny ?? 0.5) * DIAGRAM_H,
      }));
    } else if (drawType === "cycle") {
      const cx = CANVAS_W / 2, cy = DIAGRAM_TOP + DIAGRAM_H / 2;
      const r = Math.min(DIAGRAM_W, DIAGRAM_H) / 2 - NODE_W / 2;
      positions = nodes.map((n, i) => {
        const angle = (2 * Math.PI * i / nodes.length) - Math.PI / 2;
        return { id: n.id, label: n.label, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
      });
    } else if (drawType === "comparison") {
      const half = Math.ceil(nodes.length / 2);
      positions = nodes.map((n, i) => {
        const col = i < half ? 0 : 1;
        const row = col === 0 ? i : i - half;
        const rows = col === 0 ? half : nodes.length - half;
        return {
          id: n.id, label: n.label,
          x: PADDING_X + NODE_W / 2 + col * (DIAGRAM_W - NODE_W),
          y: DIAGRAM_TOP + (row + 0.5) * (DIAGRAM_H / rows),
        };
      });
    } else if (drawType === "anatomy") {
      const cx = CANVAS_W / 2, cy = DIAGRAM_TOP + DIAGRAM_H / 2;
      const r = Math.min(DIAGRAM_W, DIAGRAM_H) / 2 - NODE_W / 2;
      positions = nodes.map((n, i) => {
        if (i === 0) return { id: n.id, label: n.label, x: cx, y: cy };
        const angle = (2 * Math.PI * (i - 1) / (nodes.length - 1)) - Math.PI / 2;
        return { id: n.id, label: n.label, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
      });
    } else {
      positions = nodes.map((n, i) => ({
        id: n.id, label: n.label,
        x: PADDING_X + NODE_W / 2 + (i / Math.max(nodes.length - 1, 1)) * (DIAGRAM_W - NODE_W),
        y: DIAGRAM_TOP + DIAGRAM_H / 2,
      }));
    }

    const posMap = new Map<string, NodePos>(positions.map(p => [p.id, p]));

    ctx.save();
    ctx.globalAlpha = alpha;

    // Arrows first (behind nodes) — bright green Armando-style
    if (arrows && arrows.length > 0) {
      ctx.strokeStyle = "#86efac";
      ctx.lineWidth   = 3;
      ctx.fillStyle   = "#86efac";
      for (const arrow of arrows) {
        const from = posMap.get(arrow.from);
        const to   = posMap.get(arrow.to);
        if (!from || !to) continue;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const ax = to.x - 12 * Math.cos(angle);
        const ay = to.y - 12 * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(ax - 7 * Math.sin(angle), ay + 7 * Math.cos(angle));
        ctx.lineTo(ax + 7 * Math.sin(angle), ay - 7 * Math.cos(angle));
        ctx.closePath();
        ctx.fill();
        if (arrow.label) {
          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2 - 12;
          ctx.font = "italic 11px Arial";
          ctx.fillStyle = "#86efac";
          ctx.textAlign = "center";
          ctx.fillText(arrow.label, mx, my);
          ctx.fillStyle = "#86efac";
        }
      }
    }

    // Nodes — dark navy fill with bright strokes; anatomy uses ellipse
    const isAnatomy = drawType === "anatomy";
    for (const pos of positions) {
      const x = pos.x - NODE_W / 2;
      const y = pos.y - NODE_H / 2;
      ctx.shadowBlur   = 8;
      ctx.shadowColor  = "rgba(134,239,172,0.3)";
      ctx.fillStyle    = "#1e293b";
      ctx.strokeStyle  = "#818cf8";
      ctx.lineWidth    = 1.8;
      ctx.beginPath();
      if (isAnatomy) {
        // Oval shape for anatomy
        ctx.ellipse(pos.x, pos.y, NODE_W / 2, NODE_H / 2, 0, 0, 2 * Math.PI);
      } else if (ctx.roundRect) {
        ctx.roundRect(x, y, NODE_W, NODE_H, 8);
      } else {
        ctx.rect(x, y, NODE_W, NODE_H);
      }
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font        = "13px Arial";
      ctx.fillStyle   = "#e2e8f0";
      ctx.textAlign   = "center";
      ctx.textBaseline = "middle";
      const labelWords = pos.label.split(" ");
      if (ctx.measureText(pos.label).width < NODE_W - 12) {
        ctx.fillText(pos.label, pos.x, pos.y, NODE_W - 12);
      } else {
        const half = Math.ceil(labelWords.length / 2);
        ctx.font = "11px Arial";
        ctx.fillText(labelWords.slice(0, half).join(" "), pos.x, pos.y - 7, NODE_W - 12);
        ctx.fillText(labelWords.slice(half).join(" "), pos.x, pos.y + 7, NODE_W - 12);
      }
    }

    ctx.restore();
  };

  // RAF loop (keeps animation smooth + synced)
  useEffect(() => {
    if (!canvasRef.current || steps.length === 0) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const loop = () => {
      const p = progressWithinCurrentStep(); // 0..1
      drawStep(ctx, p);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, currentStepIndex, isPlaying, effectiveSpeed, cues, totalMs, useAIVoice]);

  /* ------------------------------------------------------------------ */
  /* Cleanup                                                            */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    return () => {
      clearTtsTimer();
      // Only release the shared controller's active slot if WE currently own
      // it — never force-stop a different component's speech on unmount.
      if (globalTokenRef.current && !isSpeechStale(globalTokenRef.current)) {
        notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const clearTtsTimer = () => {
    if (ttsTimerRef.current) {
      window.clearInterval(ttsTimerRef.current);
      ttsTimerRef.current = null;
    }
  };

  /* ------------------------------------------------------------------ */
  /* Time + stepping                                                    */
  /* ------------------------------------------------------------------ */

  /** Return current “clock” in ms since start, respecting speed & mode */
  const currentClockMs = (): number => {
    if (useAIVoice && audioRef.current) {
      return (audioRef.current.currentTime || 0) * 1000;
    }
    if (
      lastBoundaryRef.current &&
      totalMs > 0 &&
      performance.now() - lastBoundaryRef.current.atMs < BOUNDARY_FRESHNESS_MS
    ) {
      return clamp(lastBoundaryRef.current.frac * totalMs, 0, totalMs);
    }
    if (ttsStartRef.current != null) {
      const now = performance.now();
      const delta = (now - ttsStartRef.current) * clampRate(effectiveSpeed);
      return ttsElapsedRef.current + delta;
    }
    return ttsElapsedRef.current;
  };

  /** Total ms for this step's window */
  const stepWindowMs = () => {
    if (!cues.length || cues.length !== steps.length) {
      return Math.max(MIN_STEP_MS, baseStepMs());
    }
    const start = cues[currentStepIndex] ?? 0;
    const end = cues[currentStepIndex + 1] ?? totalMs;
    return Math.max(MIN_STEP_MS, end - start);
  };

  /** Fallback “base step” length */
  const baseStepMs = () =>
    Math.max(MIN_STEP_MS, (baseStepDurationMs / clampRate(effectiveSpeed)) || MIN_STEP_MS);

  /** 0..1 progress within current step time window */
  const progressWithinCurrentStep = () => {
    if (!cues.length || cues.length !== steps.length) {
      // No precise cues -> estimate by base window
      const ms = currentClockMs() % baseStepMs();
      return clamp(ms / baseStepMs(), 0, 1);
    }
    const start = cues[currentStepIndex] ?? 0;
    const end = cues[currentStepIndex + 1] ?? totalMs;
    const windowMs = Math.max(MIN_STEP_MS, end - start);
    const ms = clamp(currentClockMs() - start, 0, windowMs);
    return clamp(ms / windowMs, 0, 1);
  };

  /** AI audio: sync steps via audio timeupdate against cues */
  useEffect(() => {
    if (!useAIVoice || !audioRef.current || cues.length === 0) return;
    const el = audioRef.current;

    const onTimeUpdate = () => {
      const t = el.currentTime * 1000; // ms
      let idx = currentStepIndex;
      while (idx + 1 < cues.length && t >= cues[idx + 1]) idx++;
      while (idx > 0 && t < cues[idx]) idx--;
      if (idx !== currentStepIndex) setCurrentStepIndex(idx);
    };

    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useAIVoice, cues, currentStepIndex]);

  /** TTS/silent loop: drive steps by elapsed time vs cues */
  const startTtsLoop = () => {
    clearTtsTimer();
    ttsStartRef.current = performance.now();
    ttsTimerRef.current = window.setInterval(() => {
      if (ttsStartRef.current == null) return;
      const elapsed = currentClockMs();

      let idx = 0;
      while (idx + 1 < cues.length && elapsed >= cues[idx + 1]) idx++;
      if (idx !== currentStepIndex) setCurrentStepIndex(idx);

      if (elapsed >= totalMs && totalMs > 0) {
        stop();
      }
    }, 100) as unknown as number;
  };

  const play = () => {
    if (isStartingRef.current) {
      logBlockedDuplicate(SPEECH_OWNER);
      return;
    }
    isStartingRef.current = true;
    // claimSpeech() force-stops any speech currently active anywhere in the
    // app (StudySpeechPanel, PodcastLab, Explain Step, or a prior Whiteboard
    // narration) before this one starts.
    const token = claimSpeech(SPEECH_OWNER);
    globalTokenRef.current = token;
    setTimeout(() => { isStartingRef.current = false; }, 400);

    if (currentStepIndex >= steps.length - 1) setCurrentStepIndex(0);

    // Fresh play — clear any leftover paused-elapsed state from a previous session.
    setHasPaused(false);
    ttsElapsedRef.current = 0;
    ttsStartRef.current = null;
    lastBoundaryRef.current = null;

    if (useAIVoice) {
      if (audioRef.current && audioURL) {
        const audio = audioRef.current;
        audio.playbackRate = clampRate(effectiveSpeed);
        registerActiveAudio(token, audio, () => { audio.pause(); setIsPlaying(false); setHasPaused(false); });
        audio.onplay = () => notifySpeechStart(token, SPEECH_OWNER);
        audio.onended = () => notifySpeechEnd(token, SPEECH_OWNER);
        audio.onerror = () => { if (!isSpeechStale(token)) notifySpeechError(token, SPEECH_OWNER, "whiteboard-audio-failed"); };
        audio.play().catch(() => {});
      }
    } else {
      const trimmed = (narrationScript || "").trim();
      if ("speechSynthesis" in window && trimmed) {
        ttsStartRef.current = performance.now();
        const u = new SpeechSynthesisUtterance(trimmed);
        u.lang = "en-US";
        u.rate = clampRate(effectiveSpeed);
        u.pitch = 1.0;
        registerActiveUtterance(token, u, () => { clearTtsTimer(); setIsPlaying(false); setHasPaused(false); });
        u.onstart = () => notifySpeechStart(token, SPEECH_OWNER);
        u.onboundary = (e) => {
          if (trimmed.length > 0) {
            lastBoundaryRef.current = { frac: clamp(e.charIndex / trimmed.length, 0, 1), atMs: performance.now() };
          }
        };
        u.onend = () => { notifySpeechEnd(token, SPEECH_OWNER); stop(); };
        u.onerror = (e) => {
          if (e.error !== "canceled" && e.error !== "interrupted" && !isSpeechStale(token)) {
            notifySpeechError(token, SPEECH_OWNER, e.error);
          }
        };
        // Belt-and-suspenders: claimSpeech() already force-cancels any
        // previous utterance, but cancel() again here in case a stray
        // utterance exists outside the shared controller's tracking.
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        startTtsLoop();
      } else {
        // 🔁 Silent fallback: still auto-advance using our internal clock
        ttsElapsedRef.current = 0;
        ttsStartRef.current = performance.now();
        startTtsLoop();
      }
    }

    setIsPlaying(true);
  };

  const pause = () => {
    if (useAIVoice && audioRef.current) audioRef.current.pause();
    if (!useAIVoice) {
      // Snapshot via currentClockMs() so a fresh onboundary reading (more
      // accurate than the wall-clock delta) is preferred here too.
      if (ttsStartRef.current != null) {
        ttsElapsedRef.current = currentClockMs();
        ttsStartRef.current = null;
      }
      if ("speechSynthesis" in window) (window.speechSynthesis as any).pause?.();
      clearTtsTimer();
    }
    setIsPlaying(false);
    setHasPaused(true);
  };

  const resume = () => {
    if (useAIVoice && audioRef.current) {
      audioRef.current.playbackRate = clampRate(effectiveSpeed);
      audioRef.current.play().catch(() => {});
    } else {
      ttsStartRef.current = performance.now();
      (window.speechSynthesis as any).resume?.();
      startTtsLoop();
    }
    setIsPlaying(true);
    setHasPaused(false);
  };

  const stop = () => {
    pause();
    setCurrentStepIndex(0);
    if (useAIVoice && audioRef.current) audioRef.current.currentTime = 0;
    // Only cancel speechSynthesis / release the shared controller slot if WE
    // currently own it — another component may have claimed speech since
    // this Whiteboard session started (e.g. the watchdog in startTtsLoop
    // firing after a different component already took over).
    if (globalTokenRef.current && !isSpeechStale(globalTokenRef.current)) {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
    }
    ttsElapsedRef.current = 0;
    ttsStartRef.current = null;
    clearTtsTimer();
    setHasPaused(false);
  };

  /** Manual step nav */
  const prevStep = () =>
    setCurrentStepIndex((i) => Math.max(0, i - 1));
  const nextStep = () =>
    setCurrentStepIndex((i) => Math.min(steps.length - 1, i + 1));

  /** Respond to parent speed changes live */
  useEffect(() => {
    if (!isPlaying) return;
    if (useAIVoice && audioRef.current) {
      audioRef.current.playbackRate = clampRate(effectiveSpeed);
    }
  }, [effectiveSpeed, isPlaying, useAIVoice]);

  const onLocalSpeedChange = (val: number) => {
    setLocalSpeed(val);
    if (typeof playbackSpeed !== "number") {
      if (useAIVoice && audioRef.current) audioRef.current.playbackRate = clampRate(val);
    }
  };

  /* ----------------------- Notes overlay (persisted) ----------------------- */

  const notesForCurrentStep = stepNotes.filter((n) => n.step === currentStepIndex);

  function startAddNote() {
    setEditingNote(null);
    setNoteText("");
    setShowNoteEditor(true);
  }
  function startEditNote(note: StepNote) {
    setEditingNote(note);
    setNoteText(note.content);
    setShowNoteEditor(true);
  }
  function cancelNoteEdit() {
    setShowNoteEditor(false);
    setEditingNote(null);
    setNoteText("");
  }

  async function saveNote() {
    const text = noteText.trim();
    if (!text) return cancelNoteEdit();

    try {
      if (lessonId) {
        if (editingNote) {
          await updateStepNote(lessonId, editingNote.id, { content: text });
        } else {
          await addStepNote(lessonId, { step: currentStepIndex, content: text, userId });
        }
        // subscription refreshes state
      } else {
        // local-only
        if (editingNote) {
          setStepNotes((prev) => prev.map((n) => (n.id === editingNote.id ? { ...n, content: text } : n)));
        } else {
          const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          setStepNotes((prev) => [...prev, { id, step: currentStepIndex, content: text, userId }]);
        }
      }
    } finally {
      cancelNoteEdit();
    }
  }

  async function deleteNote(id: string) {
    if (lessonId) {
      await deleteStepNote(lessonId, id);
    } else {
      setStepNotes((prev) => prev.filter((n) => n.id !== id));
    }
  }

  /** Export: Markdown */
  const exportMarkdown = () => {
    const overlayNotes: StickyNoteLite[] = stepNotes.map((n) => ({
      pageNumber: n.step + 1,
      content: n.content,
    }));
    const allNotes = [...stickyNotes, ...overlayNotes];

    const md = buildLessonMarkdown({
      title: lessonTitle,
      narrationScript,
      steps,
      stickyNotes: allNotes,
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${slugify(lessonTitle)}.md`);
  };

  /** Export: PDF (lazy load jsPDF) */
  const exportPDF = async () => {
    try {
      const { jsPDF } = await import("jspdf"); // ensure jspdf is installed
      const doc = new jsPDF({ unit: "pt", format: "letter" });

      let y = 40;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(lessonTitle, 40, y);
      y += 24;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);

      // Narration
      doc.text("Narration Script:", 40, y);
      y += 16;
      y = addWrappedText(doc, narrationScript || "—", 40, y, 520, 14);
      y += 10;

      // Steps
      steps.forEach((s, i) => {
        if (y > 740) {
          doc.addPage();
          y = 40;
        }
        doc.setFont("helvetica", "bold");
        doc.text(`Step ${i + 1}: ${s.title}`, 40, y);
        y += 16;

        doc.setFont("helvetica", "normal");
        y = addWrappedText(doc, s.description || "", 40, y, 520, 14);
        if ((s as any).visualPrompt) {
          y = addWrappedText(doc, `(Draw: ${(s as any).visualPrompt})`, 40, y + 6, 520, 14, "#555");
        }
        y += 12;
      });

      // Sticky notes (props + overlay notes)
      const overlayNotes: StickyNoteLite[] = stepNotes.map((n) => ({
        pageNumber: n.step + 1,
        content: n.content,
      }));
      const allNotes = [...stickyNotes, ...overlayNotes];

      if (allNotes.length) {
        if (y > 700) {
          doc.addPage();
          y = 40;
        }
        doc.setFont("helvetica", "bold");
        doc.text("Sticky Notes:", 40, y);
        y += 18;
        doc.setFont("helvetica", "normal");
        allNotes.forEach((n) => {
          if (y > 740) {
            doc.addPage();
            y = 40;
          }
          y = addWrappedText(doc, `• [p.${n.pageNumber}] ${n.content}`, 48, y, 512, 14);
        });
      }

      doc.save(`${slugify(lessonTitle)}.pdf`);
    } catch (e) {
      console.error("PDF export failed:", e);
      alert("Could not export PDF. Did you install 'jspdf'?");
    }
  };

  /** Export: PNG snapshot of the current canvas frame */
  const exportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    triggerDownload(url, `${slugify(lessonTitle)}.png`);
  };

  useImperativeHandle(ref, () => ({ exportPDF, exportPNG }));

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex flex-col items-center gap-4" style={{ width: "100%" }}>
      <div
        className="relative"
        style={{ width: CANVAS_W, height: CANVAS_H, overflow: "hidden" }}
      >
        {/* Main whiteboard canvas */}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="border rounded bg-white shadow-sm"
          style={{ position: "absolute", top: 0, left: 0, zIndex: 1 }}
        />

        {/* Interactive drawing canvas overlay */}
        {enableDrawing && (
          <canvas
            ref={drawingCanvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="border rounded shadow-sm"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              zIndex: 2,
              background: "transparent",
              pointerEvents: drawingMode ? "auto" : "none",
            }}
          />
        )}

        {/* Sticky notes overlay UI (per-step) */}
        <div className="absolute right-3 top-3 w-80 max-w-[90vw] bg-white/95 text-gray-900 rounded shadow border border-gray-200 p-3 space-y-2">
          {/* Status row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                  isOnline ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700"
                }`}
                title={isOnline ? "Network available" : "You're offline; changes queue locally"}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    isOnline ? "bg-emerald-500" : "bg-gray-400"
                  }`}
                />
                {isOnline ? "Online" : "Offline"}
              </span>
              {!lessonId && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs"
                  title="Notes will not be saved to Firestore"
                >
                  🔒 Local-only
                </span>
              )}
            </div>

            {!showNoteEditor && (
              <button
                onClick={startAddNote}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded"
              >
                ➕ Add
              </button>
            )}
          </div>

          <h4 className="font-semibold text-sm mt-1">Notes for Step {currentStepIndex + 1}</h4>

          {/* List */}
          {notesForCurrentStep.length === 0 && !showNoteEditor && (
            <p className="text-xs text-gray-600">No notes yet for this step.</p>
          )}

          {notesForCurrentStep.length > 0 && (
            <ul className="space-y-1">
              {notesForCurrentStep.map((n) => (
                <li key={n.id} className="group border border-gray-200 rounded p-2 text-sm bg-white">
                  <div className="whitespace-pre-wrap break-words">{n.content}</div>
                  <div className="mt-1 hidden group-hover:flex gap-2">
                    <button onClick={() => startEditNote(n)} className="text-xs text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => deleteNote(n.id)} className="text-xs text-red-600 hover:underline">Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Editor */}
          {showNoteEditor && (
            <div className="space-y-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full h-20 text-sm border rounded p-2"
                placeholder="Type a note tied to this step…"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={cancelNoteEdit} className="text-xs px-2 py-1 rounded border">Cancel</button>
                <button onClick={saveNote} className="text-xs px-2 py-1 rounded bg-blue-600 text-white">Save</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Optional native audio (hidden UI; we drive via buttons) */}
      {useAIVoice && (
        <audio
          ref={audioRef}
          src={audioURL ?? undefined}
          onEnded={stop}
          className="hidden"
          controls
        />
      )}

      {/* Enhanced Drawing Controls */}
      {enableDrawing && (
        <div className="flex flex-col gap-3 w-full max-w-4xl">
          {/* Drawing Mode Toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setDrawingMode(!drawingMode)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                drawingMode 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg' 
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              {drawingMode ? '🎨 Drawing Mode ON' : '✏️ Enable Drawing'}
            </button>
            
            {drawingMode && (
              <div className="flex items-center gap-2">
                <button
                  onClick={undoDrawing}
                  className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-sm"
                  title="Undo last stroke"
                >
                  ↶ Undo
                </button>
                <button
                  onClick={clearDrawing}
                  className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm"
                  title="Clear all drawings"
                >
                  🗑️ Clear
                </button>
              </div>
            )}
          </div>

          {/* Drawing Tools */}
          {drawingMode && (
            <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg border">
              {/* Tool Selection */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Tool:</span>
                <div className="flex gap-1">
                  {(['pen', 'highlighter', 'eraser', 'shape', 'text'] as const).map(tool => (
                    <button
                      key={tool}
                      onClick={() => handleToolChange(tool)}
                      className={`px-3 py-1 rounded text-sm transition-colors ${
                        currentDrawingTool === tool
                          ? 'bg-blue-600 text-white'
                          : 'bg-white hover:bg-gray-100 text-gray-700 border'
                      }`}
                    >
                      {tool === 'pen' && '✏️'}
                      {tool === 'highlighter' && '🖍️'}
                      {tool === 'eraser' && '🧽'}
                      {tool === 'shape' && '⬜'}
                      {tool === 'text' && '📝'}
                      {' '}{tool.charAt(0).toUpperCase() + tool.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Picker */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Color:</span>
                <div className="flex gap-1">
                  {['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#000000'].map(color => (
                    <button
                      key={color}
                      onClick={() => handleColorChange(color)}
                      className={`w-8 h-8 rounded border-2 transition-all ${
                        drawingColor === color ? 'border-gray-800 scale-110' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color }}
                      title={`Select ${color}`}
                    />
                  ))}
                  <input
                    type="color"
                    value={drawingColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                    title="Custom color"
                  />
                </div>
              </div>

              {/* Brush Size */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Size:</span>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={drawingWidth}
                  onChange={(e) => handleWidthChange(Number(e.target.value))}
                  className="w-20 accent-blue-600"
                />
                <span className="text-sm text-gray-600 w-6">{drawingWidth}</span>
              </div>
            </div>
          )}

          {/* Smart Suggestions */}
          {drawingMode && smartSuggestions.length > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="text-sm font-medium text-blue-800 mb-2">💡 Smart Suggestions</h4>
              <div className="flex flex-wrap gap-2">
                {smartSuggestions.slice(0, 3).map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => applySuggestion(suggestion)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                    title={`Confidence: ${Math.round(suggestion.confidence * 100)}%`}
                  >
                    {suggestion.description}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transport */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={prevStep}
          className="bg-gray-700 hover:bg-gray-800 text-white px-3 py-2 rounded disabled:opacity-50"
          disabled={currentStepIndex <= 0}
        >
          ◀ Prev
        </button>

        {!isPlaying ? (
          <button
            onClick={hasPaused ? resume : play}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            ▶️ {hasPaused ? "Resume" : "Play"}
          </button>
        ) : (
          <button
            onClick={pause}
            className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded"
          >
            ⏸️ Pause
          </button>
        )}

        <button
          onClick={stop}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
        >
          ⏹️ Stop
        </button>

        <button
          onClick={nextStep}
          className="bg-gray-700 hover:bg-gray-800 text-white px-3 py-2 rounded disabled:opacity-50"
          disabled={currentStepIndex >= steps.length - 1}
        >
          Next ▶
        </button>

        {/* Speed (hidden if parent controls it) */}
        {typeof playbackSpeed !== "number" && (
          <>
            <label className="ml-2 text-sm opacity-80">Speed</label>
            <select
              value={localSpeed}
              onChange={(e) => onLocalSpeedChange(Number(e.target.value))}
              className="bg-gray-800 text-white px-2 py-1 rounded"
            >
              <option value={0.75}>0.75×</option>
              <option value={1}>1.0×</option>
              <option value={1.25}>1.25×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2.0×</option>
            </select>
          </>
        )}

        <span className="text-sm opacity-80">
          Step {Math.min(currentStepIndex + 1, steps.length)} / {steps.length}
        </span>
      </div>

      {/* Exports */}
      <div className="flex items-center gap-2">
        <button
          onClick={exportMarkdown}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded"
        >
          📄 Export Markdown
        </button>
        <button
          onClick={exportPDF}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded"
        >
          🧾 Export PDF
        </button>
        <button
          onClick={exportPNG}
          className="bg-slate-600 hover:bg-slate-700 text-white px-3 py-2 rounded"
        >
          🖼 Export PNG
        </button>
      </div>
    </div>
  );
});

Whiteboard.displayName = "Whiteboard";

export default Whiteboard;

/* ------------------------------------------------------------------ */
/* Misc helpers                                                        */
/* ------------------------------------------------------------------ */

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildLessonMarkdown({
  title,
  narrationScript,
  steps,
  stickyNotes,
}: {
  title: string;
  narrationScript: string;
  steps: WhiteboardStep[];
  stickyNotes: StickyNoteLite[];
}) {
  return `# ${title}

## Narration Script
${narrationScript ? narrationScript : "_(none)_"}

## Whiteboard Steps
${steps
  .map(
    (s, i) =>
      `### Step ${i + 1}: ${s.title}
${s.description}
${(s as any).visualPrompt ? `> Draw: ${(s as any).visualPrompt}` : ""}`
  )
  .join("\n\n")} 

${
  stickyNotes.length
    ? `## Sticky Notes
${stickyNotes.map((n) => `- [p.${n.pageNumber}] ${n.content}`).join("\n")}`
    : ""
}
`;
}

/** jsPDF word wrap */
function addWrappedText(
  doc: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  color: string = "#000"
) {
  if (!text) return y;
  doc.setTextColor(color);
  const split = doc.splitTextToSize(text, maxWidth);
  split.forEach((line: string) => {
    doc.text(line, x, y);
    y += lineHeight;
  });
  doc.setTextColor("#000");
  return y;
}

function clampRate(v: number) {
  return Math.min(2, Math.max(0.5, v || 1));
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
