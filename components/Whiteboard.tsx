// components/Whiteboard.tsx
import React, { useEffect, useRef, useState } from "react";
import type { WhiteboardStep } from "@/lib/WhiteboardExplanationService";
import {
  subscribeStepNotes,
  addStepNote,
  updateStepNote,
  deleteStepNote,
  type StepNote as PersistedStepNote,
} from "@/lib/StickyNoteService";
import { SmartDrawingEngine, type DrawingState, type SmartSuggestion } from "@/lib/smartDrawingEngine";

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

  /**
   * When provided, the whiteboard jumps to this step index instead of auto-advancing.
   * Used by PodcastLab to sync the canvas with audio segments.
   */
  controlledStepIndex?: number;

  /** 🔐 Persistence (optional). If omitted, overlay still works in-memory. */
  lessonId?: string;   // e.g. document id or slug
  userId?: string;     // current user id (if available)
  
  /** Enhanced drawing capabilities */
  enableDrawing?: boolean;
  concept?: string;
  context?: string;
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

const TITLE_FADE_MS = 450;
const UNDERLINE_MS  = 600;
const MIN_STEP_MS   = 1200;

// Colored-pencil palette — medical/dental teaching board
const MARKER = [
  "#1d4ed8", // deep blue  — primary concept
  "#b91c1c", // deep red   — danger / trap
  "#15803d", // deep green — result / solution
  "#b45309", // amber      — example / detail
  "#7c3aed", // purple     — secondary concept
  "#0369a1", // sky blue   — related
];
// Paper-like warm background
const PAPER_BG = "#fefce8";

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function Whiteboard({
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
  controlledStepIndex,
}: WhiteboardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (controlledStepIndex == null) return;
    setCurrentStepIndex(Math.max(0, Math.min(steps.length - 1, controlledStepIndex)));
  }, [controlledStepIndex, steps.length]);

  const [isPlaying, setIsPlaying] = useState(false);

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

  // Canvas animation loop
  const rafRef = useRef<number | null>(null);

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
    
    // Initialize semantic context if available
    if (concept && context) {
      engine.initializeSemanticContext(context, [concept]);
    }
    
    return () => {
      // Cleanup if needed
    };
  }, [enableDrawing, concept, context, drawingEngine]);

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

  // ── Armando diagram primitives ────────────────────────────────────────

  function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
    fill: string, stroke: string, lineWidth = 1.5
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function drawArrow(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
    color: string, label?: string
  ) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    // Slight curve — more hand-drawn feel
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
    // Bold arrowhead
    const angle = Math.atan2(y2 - my, x2 - mx);
    const hs = 11;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hs * Math.cos(angle - 0.38), y2 - hs * Math.sin(angle - 0.38));
    ctx.lineTo(x2 - hs * Math.cos(angle + 0.38), y2 - hs * Math.sin(angle + 0.38));
    ctx.closePath();
    ctx.fill();
    if (label) {
      ctx.font = "bold 11px Georgia, serif";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(label, (x1 + x2) / 2, (y1 + y2) / 2 - 10);
    }
    ctx.restore();
  }

  // Radial anatomy-style arrow from a center point outward to a labeled structure
  function drawLabeledArrow(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    tx: number, ty: number,
    label: string, color: string, p: number
  ) {
    const alpha = easeOutCubic(p);
    // Interpolate tip position based on reveal progress
    const ex = cx + (tx - cx) * p;
    const ey = cy + (ty - cy) * p;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Arrow shaft
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // Arrowhead at tip
    if (p > 0.7) {
      const angle = Math.atan2(ty - cy, tx - cx);
      const hs = 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - hs * Math.cos(angle - 0.4), ey - hs * Math.sin(angle - 0.4));
      ctx.lineTo(ex - hs * Math.cos(angle + 0.4), ey - hs * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    }
    // Label — offset outward past the tip
    if (p > 0.85) {
      const lx = tx + (tx - cx) / Math.hypot(tx - cx, ty - cy) * 10;
      const ly = ty + (ty - cy) / Math.hypot(tx - cx, ty - cy) * 10;
      ctx.font = "bold 12px Georgia, serif";
      ctx.fillStyle = color;
      ctx.textAlign = lx < CANVAS_W / 2 ? "right" : "left";
      ctx.textBaseline = "middle";
      const lines = label.split(/\s*\/\s*|\s*\n\s*/);
      lines.forEach((line, i) => ctx.fillText(line, lx, ly + i * 14 - ((lines.length - 1) * 7)));
    }
    ctx.restore();
  }

  function drawNodeLabel(
    ctx: CanvasRenderingContext2D,
    text: string, cx: number, cy: number, maxWidth: number
  ) {
    ctx.font = "bold 13px Arial";
    ctx.fillStyle = "#1e293b";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // simple word wrap for long labels
    const words = text.split(/\s+/);
    let line = "";
    const lines: string[] = [];
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth - 12 && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const lineH = 16;
    const startY = cy - ((lines.length - 1) * lineH) / 2;
    lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineH));
  }

  function drawFlowDiagram(
    ctx: CanvasRenderingContext2D,
    nodes: Array<{ id: string; label: string; nx?: number; ny?: number }>,
    arrows: Array<{ from: string; to: string; label?: string }>,
    p: number // reveal progress 0..1
  ) {
    if (!nodes.length) return;
    const NW = 150, NH = 50, GAP = 48;
    const totalW = nodes.length * NW + (nodes.length - 1) * GAP;
    const startX = Math.max(PADDING_X, (CANVAS_W - totalW) / 2);
    const baseY = 190;

    // Compute positions
    const pos: Record<string, { cx: number; cy: number }> = {};
    nodes.forEach((n, i) => {
      const cx = n.nx != null ? n.nx * CANVAS_W : startX + i * (NW + GAP) + NW / 2;
      const cy = n.ny != null ? n.ny * CANVAS_H : baseY;
      pos[n.id] = { cx, cy };
    });

    const visibleNodes = Math.ceil(nodes.length * Math.max(p, 0.15));

    // Draw arrows first (behind boxes)
    arrows.forEach((a) => {
      const from = pos[a.from];
      const to = pos[a.to];
      if (!from || !to) return;
      const fromIdx = nodes.findIndex((n) => n.id === a.from);
      if (fromIdx + 1 >= visibleNodes) return;
      drawArrow(ctx, from.cx + NW / 2, from.cy, to.cx - NW / 2, to.cy, "#64748b", a.label);
    });

    // Draw boxes — colored-marker style, one color per node
    nodes.slice(0, visibleNodes).forEach((n, idx) => {
      const { cx, cy } = pos[n.id];
      const alpha = clamp(p * nodes.length - nodes.findIndex((nn) => nn.id === n.id), 0, 1);
      const strokeColor = MARKER[idx % MARKER.length];
      // Light tint fill from stroke color
      ctx.save();
      ctx.globalAlpha = easeOutCubic(alpha);
      drawRoundedRect(ctx, cx - NW / 2, cy - NH / 2, NW, NH, 8, `${strokeColor}18`, strokeColor, 2.2);
      ctx.font = "bold 13px Georgia, serif";
      ctx.fillStyle = strokeColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const words = n.label.split(/\s+/);
      let line = "";
      const lines: string[] = [];
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > NW - 12 && line) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      const lineH = 16;
      const startY = cy - ((lines.length - 1) * lineH) / 2;
      lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineH));
      ctx.restore();
    });
  }

  function drawComparisonDiagram(
    ctx: CanvasRenderingContext2D,
    nodes: Array<{ id: string; label: string }>,
    descriptionText: string,
    p: number
  ) {
    const colW = (CANVAS_W - PADDING_X * 2 - 40) / 2;
    const colH = 160;
    const topY = 140;
    const alpha = easeOutCubic(p);

    const cols = nodes.slice(0, 2);
    cols.forEach((n, i) => {
      const x = PADDING_X + i * (colW + 40);
      const isLeft = i === 0;
      ctx.save();
      ctx.globalAlpha = alpha;
      const fill = isLeft ? "#fef2f2" : "#f0fdf4";
      const stroke = isLeft ? "#ef4444" : "#22c55e";
      drawRoundedRect(ctx, x, topY, colW, colH, 10, fill, stroke, 2);
      ctx.font = "bold 14px Arial";
      ctx.fillStyle = stroke;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(n.label, x + colW / 2, topY + 12);
      ctx.restore();
    });

    // Divider
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_W / 2, topY - 10);
    ctx.lineTo(CANVAS_W / 2, topY + colH + 10);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Description text below
    if (descriptionText) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.font = "14px Arial";
      ctx.fillStyle = "#374151";
      ctx.textAlign = "center";
      const words = descriptionText.split(/\s+/);
      let line = "";
      let y = topY + colH + 20;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > CANVAS_W - PADDING_X * 2 && line) {
          ctx.fillText(line, CANVAS_W / 2, y);
          line = w;
          y += 20;
          if (y > CANVAS_H - 20) break;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, CANVAS_W / 2, y);
      ctx.restore();
    }
  }

  function drawTableDiagram(
    ctx: CanvasRenderingContext2D,
    nodes: Array<{ id: string; label: string }>,
    p: number
  ) {
    if (!nodes.length) return;
    const rows = Math.ceil(nodes.length / 2);
    const cellW = (CANVAS_W - PADDING_X * 2) / 2;
    const cellH = 48;
    const startY = 130;
    const alpha = easeOutCubic(p);

    nodes.slice(0, Math.ceil(nodes.length * Math.max(p, 0.2))).forEach((n, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = PADDING_X + col * cellW;
      const y = startY + row * cellH;
      ctx.save();
      ctx.globalAlpha = alpha;
      drawRoundedRect(ctx, x + 2, y + 2, cellW - 4, cellH - 4, 6,
        col === 0 ? "#f8fafc" : "#f1f5f9",
        col === 0 ? "#6366f1" : "#94a3b8", 1.2);
      ctx.font = col === 0 ? "bold 13px Arial" : "13px Arial";
      ctx.fillStyle = col === 0 ? "#312e81" : "#374151";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.label.slice(0, 30), x + cellW / 2, y + cellH / 2);
      ctx.restore();
    });
  }

  function drawAxisDiagram(
    ctx: CanvasRenderingContext2D,
    nodes: Array<{ id: string; label: string; nx?: number; ny?: number }>,
    _arrows: Array<{ from: string; to: string; label?: string }>,
    p: number
  ) {
    const AXIS_X  = PADDING_X + 50;
    const AXIS_Y  = CANVAS_H - 55;
    const AXIS_W  = CANVAS_W - AXIS_X - PADDING_X - 20;
    const AXIS_H  = AXIS_Y - 95;
    const alpha   = easeOutCubic(p);

    // Parse nodes into data points and optional limit
    const dataPoints: Array<{ xv: number; yv: number }> = [];
    let limitValue: number | null = null;
    let limitLabel = "";

    for (const n of nodes) {
      const lb = (n.label || "").trim();
      // Limit node: "L=2" or "L=∞"
      const limitM = lb.match(/^L\s*=\s*(.+)$/i);
      if (limitM) {
        const lv = parseFloat(limitM[1]);
        if (!isNaN(lv)) limitValue = lv;
        limitLabel = limitM[1].trim();
        continue;
      }
      // Data point: "x=1, y=0.5" or "n=2, a=0.25" or "1, 0.5"
      const ptM = lb.match(/[xn]\s*=\s*([\d.+-]+)[,\s]+[ya]\s*=\s*([\d.+-]+)/i)
               ?? lb.match(/([\d.+-]+)\s*,\s*([\d.+-]+)/);
      if (ptM) {
        const xv = parseFloat(ptM[1]);
        const yv = parseFloat(ptM[2]);
        if (!isNaN(xv) && !isNaN(yv)) dataPoints.push({ xv, yv });
      }
    }

    // Draw axes
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#374151";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(AXIS_X, AXIS_Y - AXIS_H);
    ctx.lineTo(AXIS_X, AXIS_Y);
    ctx.lineTo(AXIS_X + AXIS_W, AXIS_Y);
    ctx.stroke();
    // Arrow heads
    ctx.fillStyle = "#374151";
    ctx.beginPath(); // Y arrow
    ctx.moveTo(AXIS_X, AXIS_Y - AXIS_H - 6);
    ctx.lineTo(AXIS_X - 4, AXIS_Y - AXIS_H + 8);
    ctx.lineTo(AXIS_X + 4, AXIS_Y - AXIS_H + 8);
    ctx.fill();
    ctx.beginPath(); // X arrow
    ctx.moveTo(AXIS_X + AXIS_W + 6, AXIS_Y);
    ctx.lineTo(AXIS_X + AXIS_W - 8, AXIS_Y - 4);
    ctx.lineTo(AXIS_X + AXIS_W - 8, AXIS_Y + 4);
    ctx.fill();
    ctx.restore();

    if (dataPoints.length === 0) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.6;
      ctx.font = "13px Arial";
      ctx.fillStyle = "#6b7280";
      ctx.textAlign = "center";
      ctx.fillText("(no data points parsed)", CANVAS_W / 2, CANVAS_H / 2);
      ctx.restore();
      return;
    }

    const sorted   = [...dataPoints].sort((a, b) => a.xv - b.xv);
    const xMin     = sorted[0].xv;
    const xMax     = sorted[sorted.length - 1].xv;
    const allY     = sorted.map((d) => d.yv);
    if (limitValue !== null) allY.push(limitValue);
    const yMin     = Math.min(0, ...allY);
    const yMax     = Math.max(...allY);
    const xRange   = Math.max(xMax - xMin, 1);
    const yRange   = Math.max(yMax - yMin, 1);

    const toX = (xv: number) => AXIS_X + ((xv - xMin) / xRange) * AXIS_W;
    const toY = (yv: number) => AXIS_Y - ((yv - yMin) / yRange) * AXIS_H;

    // Dashed limit line
    if (limitValue !== null) {
      const ly = toY(limitValue);
      ctx.save();
      ctx.globalAlpha = alpha * 0.65;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(AXIS_X, ly);
      ctx.lineTo(AXIS_X + AXIS_W, ly);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font      = "bold 12px Arial";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "right";
      ctx.fillText(`L = ${limitLabel}`, AXIS_X + AXIS_W, ly - 5);
      ctx.restore();
    }

    // Curve through points (bezier)
    const visCount  = Math.max(1, Math.ceil(sorted.length * Math.max(p, 0.1)));
    const visible   = sorted.slice(0, visCount);
    if (visible.length >= 2) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.moveTo(toX(visible[0].xv), toY(visible[0].yv));
      for (let i = 1; i < visible.length; i++) {
        const prev = visible[i - 1];
        const curr = visible[i];
        const cpx  = (toX(prev.xv) + toX(curr.xv)) / 2;
        ctx.bezierCurveTo(cpx, toY(prev.yv), cpx, toY(curr.yv), toX(curr.xv), toY(curr.yv));
      }
      ctx.stroke();
      ctx.restore();
    }

    // Dots + labels
    visible.forEach((pt, i) => {
      const cx       = toX(pt.xv);
      const cy       = toY(pt.yv);
      const dotAlpha = clamp(p * sorted.length - i, 0, 1);
      ctx.save();
      ctx.globalAlpha = easeOutCubic(dotAlpha);
      ctx.fillStyle   = "#3b82f6";
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      if (sorted.length <= 10 || i % 2 === 0) {
        ctx.font      = "11px Arial";
        ctx.fillStyle = "#1f2937";
        ctx.textAlign = "center";
        ctx.fillText(`(${pt.xv},${Math.round(pt.yv * 100) / 100})`, cx, cy - 10);
      }
      ctx.restore();
    });

    // X-axis tick labels
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.font        = "11px Arial";
    ctx.fillStyle   = "#6b7280";
    ctx.textAlign   = "center";
    const tickCount = Math.min(sorted.length, 6);
    for (let t = 0; t <= tickCount; t++) {
      const xv = xMin + (t / tickCount) * xRange;
      const cx = toX(xv);
      ctx.fillText(String(Math.round(xv * 10) / 10), cx, AXIS_Y + 16);
    }
    ctx.restore();
  }

  // ── History timeline ─────────────────────────────────────────────────────────
  // Horizontal axis with events alternating above/below, colored dots, dashed leaders.
  function drawTimeline(
    ctx: CanvasRenderingContext2D,
    nodes: Array<{ id: string; label: string; nx?: number; ny?: number }>,
    _arrows: Array<{ from: string; to: string; label?: string }>,
    p: number
  ) {
    if (!nodes.length) return;
    const TL_Y  = CANVAS_H / 2 + 10;
    const TL_X1 = PADDING_X + 30;
    const TL_X2 = CANVAS_W - PADDING_X - 30;
    const TL_W  = TL_X2 - TL_X1;
    const alpha = easeOutCubic(p);

    // Axis line reveals left→right
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#374151";
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.moveTo(TL_X1, TL_Y);
    ctx.lineTo(TL_X1 + TL_W * Math.min(p * 1.3, 1), TL_Y);
    ctx.stroke();
    if (p > 0.75) {
      ctx.fillStyle = "#374151";
      ctx.beginPath();
      ctx.moveTo(TL_X2 + 8, TL_Y);
      ctx.lineTo(TL_X2 - 6, TL_Y - 5);
      ctx.lineTo(TL_X2 - 6, TL_Y + 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    const visibleNodes = Math.max(1, Math.ceil(nodes.length * Math.max(p, 0.15)));
    nodes.slice(0, visibleNodes).forEach((n, i) => {
      const x      = TL_X1 + (nodes.length > 1 ? (i / (nodes.length - 1)) * TL_W : TL_W / 2);
      const above  = i % 2 === 0;
      const labelCY = TL_Y + (above ? -58 : 58);
      const na     = easeOutCubic(clamp(p * nodes.length - i, 0, 1));
      const color  = MARKER[i % MARKER.length];

      ctx.save();
      ctx.globalAlpha = na;
      // Tick
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, TL_Y - 7); ctx.lineTo(x, TL_Y + 7); ctx.stroke();
      // Dot
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, TL_Y, 5, 0, Math.PI * 2); ctx.fill();
      // Dashed leader
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, above ? TL_Y - 8 : TL_Y + 8);
      ctx.lineTo(x, above ? labelCY + 10 : labelCY - 10);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label word-wrap
      ctx.font = "bold 11px Georgia, serif";
      const words = n.label.split(/\s+/);
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(test).width > 90 && cur) { lines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      lines.forEach((l, li) => ctx.fillText(l, x, labelCY + li * 14 - ((lines.length - 1) * 7)));
      ctx.restore();
    });
  }

  // ── Biology cycle (circular flow) ────────────────────────────────────────────
  // Nodes placed in a ring; curved arrows connecting each step around the cycle.
  function drawCycleDiagram(
    ctx: CanvasRenderingContext2D,
    nodes: Array<{ id: string; label: string; nx?: number; ny?: number }>,
    arrows: Array<{ from: string; to: string; label?: string }>,
    p: number
  ) {
    if (!nodes.length) return;
    const CX = CANVAS_W / 2, CY = CANVAS_H / 2 + 8;
    const RADIUS = 148, NW = 108, NH = 40;

    const pos: Record<string, { cx: number; cy: number }> = {};
    nodes.forEach((n, i) => {
      if (n.nx != null && n.ny != null) {
        pos[n.id] = { cx: n.nx * CANVAS_W, cy: n.ny * CANVAS_H };
      } else {
        const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        pos[n.id] = { cx: CX + RADIUS * Math.cos(angle), cy: CY + RADIUS * Math.sin(angle) };
      }
    });

    const visibleNodes = Math.max(1, Math.ceil(nodes.length * Math.max(p, 0.15)));
    const arrowList = arrows.length > 0 ? arrows :
      nodes.map((n, i) => ({ from: n.id, to: nodes[(i + 1) % nodes.length].id, label: undefined as string | undefined }));

    arrowList.forEach((a, ai) => {
      const from = pos[a.from], to = pos[a.to];
      if (!from || !to) return;
      const fromIdx = nodes.findIndex(n => n.id === a.from);
      if (fromIdx + 1 > visibleNodes) return;
      const ap    = easeOutCubic(clamp(p * nodes.length - ai, 0, 1));
      const color = MARKER[ai % MARKER.length];
      const midX  = (from.cx + to.cx) / 2, midY = (from.cy + to.cy) / 2;
      const cpX   = CX + (midX - CX) * 1.5, cpY = CY + (midY - CY) * 1.5;
      ctx.save();
      ctx.globalAlpha = ap;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(from.cx, from.cy); ctx.quadraticCurveTo(cpX, cpY, to.cx, to.cy); ctx.stroke();
      const angle = Math.atan2(to.cy - cpY, to.cx - cpX), hs = 10;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(to.cx, to.cy);
      ctx.lineTo(to.cx - hs * Math.cos(angle - 0.38), to.cy - hs * Math.sin(angle - 0.38));
      ctx.lineTo(to.cx - hs * Math.cos(angle + 0.38), to.cy - hs * Math.sin(angle + 0.38));
      ctx.closePath(); ctx.fill();
      if (a.label) {
        ctx.font = "10px Georgia, serif"; ctx.fillStyle = color; ctx.textAlign = "center";
        ctx.fillText(a.label, midX + (cpX - midX) * 0.4, midY + (cpY - midY) * 0.4 - 7);
      }
      ctx.restore();
    });

    nodes.slice(0, visibleNodes).forEach((n, i) => {
      const { cx, cy } = pos[n.id];
      const na    = easeOutCubic(clamp(p * nodes.length - i, 0, 1));
      const color = MARKER[i % MARKER.length];
      ctx.save(); ctx.globalAlpha = na;
      drawRoundedRect(ctx, cx - NW / 2, cy - NH / 2, NW, NH, 8, `${color}1a`, color, 2);
      ctx.font = "bold 12px Georgia, serif"; ctx.fillStyle = color;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const words = n.label.split(/\s+/); let line = ""; const lines: string[] = [];
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > NW - 12 && line) { lines.push(line); line = w; } else line = test;
      }
      if (line) lines.push(line);
      lines.forEach((l, li) => ctx.fillText(l, cx, cy + li * 15 - ((lines.length - 1) * 7.5)));
      ctx.restore();
    });
  }

  // ── Anatomy / medicine sketch ────────────────────────────────────────────────
  // Central oval (main concept) with labeled arrows radiating to surrounding structures.
  // Uses nx/ny node positions if set; otherwise places nodes in a radial pattern.
  function drawAnatomySketch(
    ctx: CanvasRenderingContext2D,
    nodes: Array<{ id: string; label: string; nx?: number; ny?: number }>,
    arrows: Array<{ from: string; to: string; label?: string }>,
    p: number
  ) {
    if (!nodes.length) return;

    const CX = CANVAS_W / 2;
    const CY = CANVAS_H / 2 + 10;

    // Identify the "root" node — first node, or the one that arrows mostly originate from
    const rootId = arrows.length > 0
      ? (arrows.reduce((acc, a) => { acc[a.from] = (acc[a.from] ?? 0) + 1; return acc; }, {} as Record<string, number>))
        ? Object.entries(
            arrows.reduce((acc, a) => { acc[a.from] = (acc[a.from] ?? 0) + 1; return acc; }, {} as Record<string, number>)
          ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? nodes[0].id
        : nodes[0].id
      : nodes[0].id;

    const rootNode   = nodes.find(n => n.id === rootId) ?? nodes[0];
    const otherNodes = nodes.filter(n => n.id !== rootNode.id);

    // Positions — use nx/ny if set, else radial
    const pos: Record<string, { cx: number; cy: number }> = {};
    pos[rootNode.id] = { cx: CX, cy: CY };

    const RADIUS = 155;
    otherNodes.forEach((n, i) => {
      if (n.nx != null && n.ny != null) {
        pos[n.id] = { cx: n.nx * CANVAS_W, cy: n.ny * CANVAS_H };
      } else {
        const angle = (i / Math.max(otherNodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
        pos[n.id] = { cx: CX + RADIUS * Math.cos(angle), cy: CY + RADIUS * Math.sin(angle) };
      }
    });

    // Draw arrows first
    const arrowReveal = Math.max(p, 0);
    arrows.forEach((a, ai) => {
      const from = pos[a.from];
      const to   = pos[a.to];
      if (!from || !to) return;
      const ap = clamp(arrowReveal * arrows.length - ai, 0, 1);
      drawLabeledArrow(ctx, from.cx, from.cy, to.cx, to.cy, a.label ?? "", MARKER[ai % MARKER.length], ap);
    });

    // Draw root node as oval
    const rootAlpha = easeOutCubic(Math.min(1, p * 2));
    ctx.save();
    ctx.globalAlpha = rootAlpha;
    ctx.strokeStyle = MARKER[0];
    ctx.lineWidth   = 2.5;
    ctx.fillStyle   = `${MARKER[0]}1a`;
    const RW = 110, RH = 44;
    ctx.beginPath();
    ctx.ellipse(CX, CY, RW / 2, RH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font        = "bold 13px Georgia, serif";
    ctx.fillStyle   = MARKER[0];
    ctx.textAlign   = "center";
    ctx.textBaseline = "middle";
    // Word-wrap root label
    const rWords = rootNode.label.split(/\s+/);
    let rLine = "";
    const rLines: string[] = [];
    for (const w of rWords) {
      const test = rLine ? `${rLine} ${w}` : w;
      if (ctx.measureText(test).width > RW - 12 && rLine) { rLines.push(rLine); rLine = w; }
      else rLine = test;
    }
    if (rLine) rLines.push(rLine);
    rLines.forEach((l, i) => ctx.fillText(l, CX, CY + i * 15 - ((rLines.length - 1) * 7.5)));
    ctx.restore();

    // Draw surrounding nodes as light labeled circles
    otherNodes.forEach((n, i) => {
      const { cx, cy } = pos[n.id];
      const ni = i + 1;
      const na = easeOutCubic(clamp(p * (nodes.length) - ni, 0, 1));
      const color = MARKER[(ni) % MARKER.length];
      ctx.save();
      ctx.globalAlpha = na;
      ctx.fillStyle   = `${color}22`;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font        = "bold 11px Georgia, serif";
      ctx.fillStyle   = color;
      ctx.textAlign   = "center";
      ctx.textBaseline = "middle";
      const nWords = n.label.split(/\s+/);
      let nLine = "";
      const nLines: string[] = [];
      for (const w of nWords) {
        const test = nLine ? `${nLine} ${w}` : w;
        if (ctx.measureText(test).width > 44 && nLine) { nLines.push(nLine); nLine = w; }
        else nLine = test;
      }
      if (nLine) nLines.push(nLine);
      nLines.forEach((l, li) => ctx.fillText(l, cx, cy + li * 13 - ((nLines.length - 1) * 6.5)));
      ctx.restore();
    });
  }

  // Baseline draw (called every frame)
  const drawStep = (ctx: CanvasRenderingContext2D, progressWithinStep: number) => {
    const canvas = ctx.canvas;
    const step = steps[currentStepIndex] || { title: "", description: "" };
    const drawType = (step as any).drawType as string | undefined;
    const stepNodes = (step as any).nodes as Array<{ id: string; label: string; nx?: number; ny?: number }> | undefined;
    const stepArrows = (step as any).arrows as Array<{ from: string; to: string; label?: string }> | undefined;

    // bg — warm paper for diagram steps, clean white for text-only
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = drawType ? PAPER_BG : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title fade-in
    const title = step.title || `Step ${currentStepIndex + 1}`;
    ctx.font = "bold 22px Georgia, serif";
    const titleWidth = Math.min(CANVAS_W - 2 * PADDING_X, ctx.measureText(title).width);

    const stepMs = stepWindowMs();
    const titleAlpha = easeOutCubic(Math.min(1, (progressWithinStep * stepMs) / TITLE_FADE_MS));
    ctx.save();
    ctx.globalAlpha = titleAlpha;
    ctx.fillStyle = drawType ? "#1e3a5f" : "#111827";
    ctx.fillText(title, PADDING_X, TITLE_Y);
    ctx.restore();

    // Scribble underline
    const underlineP = Math.min(1, (progressWithinStep * stepMs) / UNDERLINE_MS);
    drawScribbleUnderline(ctx, PADDING_X, TITLE_Y + 6, titleWidth + 8, underlineP);

    // Diagram reveal progress (slightly delayed so title paints first)
    const diagMs = Math.max(MIN_STEP_MS * 0.8, stepMs * 0.85);
    const diagP = isPlaying ? clamp((progressWithinStep * stepMs - 300) / diagMs, 0, 1) : 1;

    if (drawType === "anatomy") {
      drawAnatomySketch(ctx, stepNodes ?? [], stepArrows ?? [], diagP);
    } else if (drawType === "cycle") {
      drawCycleDiagram(ctx, stepNodes ?? [], stepArrows ?? [], diagP);
    } else if (drawType === "timeline") {
      drawTimeline(ctx, stepNodes ?? [], stepArrows ?? [], diagP);
    } else if (drawType === "flow") {
      drawFlowDiagram(ctx, stepNodes ?? [], stepArrows ?? [], diagP);
    } else if (drawType === "comparison") {
      drawComparisonDiagram(ctx, stepNodes ?? [], step.description ?? "", diagP);
    } else if (drawType === "table") {
      drawTableDiagram(ctx, stepNodes ?? [], diagP);
    } else if (drawType === "graph") {
      drawAxisDiagram(ctx, stepNodes ?? [], stepArrows ?? [], diagP);
    } else {
      // Text-based rendering (original behaviour)
      const desc = step.description || "";
      ctx.font = "18px Georgia, serif";
      ctx.fillStyle = "#1f2937";
      const words = desc.trim().length ? desc.trim().split(/\s+/) : [];
      const revealMs = Math.max(MIN_STEP_MS * 0.8, stepMs * 0.9);
      const revealRatio = isPlaying ? clamp((progressWithinStep * stepMs) / revealMs, 0, 1) : 1;
      const visibleWords = Math.max(0, Math.floor(words.length * revealRatio));
      drawWrappedWords(ctx, words, visibleWords, PADDING_X, DESC_Y, CANVAS_W - 2 * PADDING_X, DESC_LINE_H);
    }

    // Step index badge (bottom-right)
    if (drawType) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.font = "11px Arial";
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "right";
      ctx.fillText(`${currentStepIndex + 1} / ${steps.length}  [${drawType}]`, CANVAS_W - PADDING_X, CANVAS_H - 12);
      ctx.restore();
    }

    // Visual prompt hint
    if ((step as any).visualPrompt && !drawType) {
      ctx.font = "italic 16px Arial";
      ctx.fillStyle = "#6b7280";
      ctx.fillText(`(Draw: ${(step as any).visualPrompt})`, PADDING_X, canvas.height - 24);
    }
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
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
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
      const elapsedNow = (performance.now() - ttsStartRef.current) * clampRate(effectiveSpeed);
      const elapsed = ttsElapsedRef.current + elapsedNow;

      let idx = 0;
      while (idx + 1 < cues.length && elapsed >= cues[idx + 1]) idx++;
      if (idx !== currentStepIndex) setCurrentStepIndex(idx);

      if (elapsed >= totalMs && totalMs > 0) {
        stop();
      }
    }, 100) as unknown as number;
  };

  const play = () => {
    if (currentStepIndex >= steps.length - 1) setCurrentStepIndex(0);

    if (useAIVoice) {
      if (audioRef.current && audioURL) {
        audioRef.current.playbackRate = clampRate(effectiveSpeed);
        audioRef.current.play().catch(() => {});
      }
    } else {
      const trimmed = (narrationScript || "").trim();
      if ("speechSynthesis" in window && trimmed) {
        if (ttsElapsedRef.current === 0) {
          ttsStartRef.current = performance.now();
        }
        const u = new SpeechSynthesisUtterance(trimmed);
        u.lang = "en-US";
        u.rate = clampRate(effectiveSpeed);
        u.pitch = 1.0;
        u.onend = () => stop();
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
    if (!useAIVoice && "speechSynthesis" in window) {
      if (ttsStartRef.current != null) {
        const elapsedNow = (performance.now() - ttsStartRef.current) * clampRate(effectiveSpeed);
        ttsElapsedRef.current += elapsedNow;
        ttsStartRef.current = null;
      }
      (window.speechSynthesis as any).pause?.();
      clearTtsTimer();
    } else {
      if (ttsStartRef.current != null) {
        const elapsedNow = (performance.now() - ttsStartRef.current) * clampRate(effectiveSpeed);
        ttsElapsedRef.current += elapsedNow;
        ttsStartRef.current = null;
      }
      clearTtsTimer();
    }
    setIsPlaying(false);
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
  };

  const stop = () => {
    pause();
    setCurrentStepIndex(0);
    if (useAIVoice && audioRef.current) audioRef.current.currentTime = 0;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    ttsElapsedRef.current = 0;
    ttsStartRef.current = null;
    clearTtsTimer();
  };

  // Log animation state on step change
  useEffect(() => {
    if (!steps.length) return;
    const step = steps[currentStepIndex] as any;
    console.log("[WHITEBOARD_ANIMATION_STATE]", {
      stepIdx:       currentStepIndex,
      title:         step?.title ?? null,
      drawType:      step?.drawType ?? "text",
      nodes:         step?.nodes?.length ?? 0,
      arrows:        step?.arrows?.length ?? 0,
      evidenceRefId: step?.evidenceRefId ?? null,
      isPlaying,
    });
  }, [currentStepIndex, steps, isPlaying]);

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

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  console.log("[WHITEBOARD_LAYOUT]", { stepCount: steps.length, canvasW: CANVAS_W, canvasH: CANVAS_H, enableDrawing });

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H, maxWidth: "100%", overflow: "hidden" }}>
        {/* Main whiteboard canvas */}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="border rounded bg-white shadow-sm"
          style={{ position: 'absolute', zIndex: 1 }}
        />
        
        {/* Interactive drawing canvas overlay */}
        {enableDrawing && (
          <canvas
            ref={drawingCanvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="border rounded shadow-sm"
            style={{ 
              position: 'absolute', 
              zIndex: 2,
              background: 'transparent',
              pointerEvents: drawingMode ? 'auto' : 'none'
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
            onClick={currentStepIndex === 0 ? play : resume}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            ▶️ {currentStepIndex === 0 ? "Play" : "Resume"}
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
      </div>
    </div>
  );
}

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
