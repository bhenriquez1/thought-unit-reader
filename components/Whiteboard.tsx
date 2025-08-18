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
}: WhiteboardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
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

    // bg
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title fade-in
    const title = step.title || `Step ${currentStepIndex + 1}`;
    ctx.font = "bold 22px Arial";
    const titleWidth = Math.min(CANVAS_W - 2 * PADDING_X, ctx.measureText(title).width);

    const stepMs = stepWindowMs();
    const titleAlpha = easeOutCubic(Math.min(1, (progressWithinStep * stepMs) / TITLE_FADE_MS));
    ctx.save();
    ctx.globalAlpha = titleAlpha;
    ctx.fillStyle = "#111827";
    ctx.fillText(title, PADDING_X, TITLE_Y);
    ctx.restore();

    // Scribble underline
    const underlineP = Math.min(1, (progressWithinStep * stepMs) / UNDERLINE_MS);
    drawScribbleUnderline(ctx, PADDING_X, TITLE_Y + 6, titleWidth + 8, underlineP);

    // Description — animated word reveal
    const desc = step.description || "";
    ctx.font = "18px Arial";
    ctx.fillStyle = "#1f2937";
    const words = desc.trim().length ? desc.trim().split(/\s+/) : [];

    // reveal pacing: most of the step duration
    const revealMs = Math.max(MIN_STEP_MS * 0.8, stepMs * 0.9);
    const revealRatio = isPlaying ? clamp((progressWithinStep * stepMs) / revealMs, 0, 1) : 1;
    const visibleWords = Math.max(0, Math.floor(words.length * revealRatio));

    drawWrappedWords(ctx, words, visibleWords, PADDING_X, DESC_Y, CANVAS_W - 2 * PADDING_X, DESC_LINE_H);

    // Visual prompt hint
    if ((step as any).visualPrompt) {
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
        y = addWrappedText(doc, s.description, 40, y, 520, 14);
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

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="border rounded bg-white shadow-sm"
        />

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