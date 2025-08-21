"use client";

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

type StickyNoteLite = { pageNumber: number; content: string };
type StepNote = { id: string; step: number; content: string; userId?: string };

interface EnhancedWhiteboardProps {
  steps: WhiteboardStep[];
  audioBlob?: Blob | null;
  useAIVoice?: boolean;
  narrationScript?: string;
  baseStepDurationMs?: number;
  stickyNotes?: StickyNoteLite[];
  lessonTitle?: string;
  playbackSpeed?: number;

  // Enhanced features
  currentPage?: number;
  onPageChange?: (page: number) => void;
  selectedVoice?: SpeechSynthesisVoice;
  onVoiceChange?: (voice: SpeechSynthesisVoice) => void;
  speechRate?: number;
  onSpeechRateChange?: (rate: number) => void;
  naturalAnimations?: boolean;

  lessonId?: string;
  userId?: string;
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

const TITLE_FADE_MS = 600; // Smoother fade in
const UNDERLINE_MS = 800; // More natural underline
const MIN_STEP_MS = 1500; // Longer minimum for natural pacing

/* ------------------------------------------------------------------ */
/* Enhanced Animation Functions                                       */
/* ------------------------------------------------------------------ */

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;

  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75;
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
}

function naturalHandwriting(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  progress: number,
  jitter: number = 0.5
) {
  const chars = text.split('');
  const visibleChars = Math.floor(chars.length * progress);
  
  ctx.save();
  let currentX = x;
  
  for (let i = 0; i < visibleChars; i++) {
    const char = chars[i];
    const charProgress = Math.min(1, (progress * chars.length - i));
    
    // Add natural jitter
    const jitterX = (Math.random() - 0.5) * jitter * charProgress;
    const jitterY = (Math.random() - 0.5) * jitter * charProgress;
    
    ctx.globalAlpha = easeInOutCubic(charProgress);
    ctx.fillText(char, currentX + jitterX, y + jitterY);
    currentX += ctx.measureText(char).width;
  }
  
  ctx.restore();
}

function drawNaturalUnderline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  progress: number
) {
  const segments = Math.max(12, Math.floor(width / 20));
  const drawnSegments = Math.floor(segments * progress);
  
  ctx.save();
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  ctx.beginPath();
  for (let i = 0; i <= drawnSegments; i++) {
    const t = i / segments;
    const segmentX = x + width * t;
    
    // Natural hand-drawn variation
    const waveY = Math.sin(t * Math.PI * 3) * 1.5;
    const randomY = (Math.random() - 0.5) * 1;
    const finalY = y + waveY + randomY;
    
    if (i === 0) {
      ctx.moveTo(segmentX, finalY);
    } else {
      ctx.lineTo(segmentX, finalY);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function EnhancedWhiteboard({
  steps,
  audioBlob = null,
  useAIVoice = false,
  narrationScript = "",
  baseStepDurationMs = 4000,
  stickyNotes = [],
  lessonTitle = "Enhanced Whiteboard Lesson",
  playbackSpeed,
  currentPage = 1,
  onPageChange,
  selectedVoice,
  onVoiceChange,
  speechRate = 1.0,
  onSpeechRateChange,
  naturalAnimations = true,
  lessonId,
  userId,
}: EnhancedWhiteboardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localSpeed, setLocalSpeed] = useState<number>(1.0);
  const effectiveSpeed = playbackSpeed ?? localSpeed;

  // Enhanced voice features
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentUtterance, setCurrentUtterance] = useState<SpeechSynthesisUtterance | null>(null);

  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [audioDurationSec, setAudioDurationSec] = useState<number | null>(null);
  const [cues, setCues] = useState<number[]>([]);
  const [totalMs, setTotalMs] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Enhanced timing for natural speech
  const ttsStartRef = useRef<number | null>(null);
  const ttsElapsedRef = useRef<number>(0);
  const ttsTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Step notes
  const [stepNotes, setStepNotes] = useState<StepNote[]>([]);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<StepNote | null>(null);
  const [noteText, setNoteText] = useState("");
  const [isOnline, setIsOnline] = useState(true);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  // Online/offline detection
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

  // Subscribe to step notes
  useEffect(() => {
    if (!lessonId) return;
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

  // Build audio URL
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

  // Load audio duration
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

  // Compute enhanced cues with natural pacing
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
      // More natural pacing - slower for better comprehension
      total = wordCount > 0
        ? (wordCount / 140) * 60_000 // Slower than 160 WPM
        : Math.max(MIN_STEP_MS * steps.length, steps.length * baseStepDurationMs);
    }

    let acc = 0;
    const starts = wordsPerStep.map((w) => {
      const start = acc;
      // Add natural pauses between steps
      const stepDuration = (w / Math.max(1, sumWords)) * total;
      const naturalPause = Math.min(500, stepDuration * 0.1);
      acc += stepDuration + naturalPause;
      return start;
    });

    setCues(starts);
    setTotalMs(total);
  }, [steps, useAIVoice, audioDurationSec, narrationScript, baseStepDurationMs]);

  // Enhanced drawing with natural animations
  const drawStep = (ctx: CanvasRenderingContext2D, progressWithinStep: number) => {
    const canvas = ctx.canvas;
    const step = steps[currentStepIndex] || { title: "", description: "" };

    // Clear with subtle background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#fefefe");
    gradient.addColorStop(1, "#f8f9fa");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Enhanced title with natural handwriting effect
    const title = step.title || `Step ${currentStepIndex + 1}`;
    ctx.font = "bold 24px 'Comic Sans MS', cursive"; // More natural font
    const titleWidth = Math.min(CANVAS_W - 2 * PADDING_X, ctx.measureText(title).width);

    const stepMs = stepWindowMs();
    const titleProgress = Math.min(1, (progressWithinStep * stepMs) / TITLE_FADE_MS);
    
    ctx.fillStyle = "#1a202c";
    if (naturalAnimations) {
      naturalHandwriting(ctx, title, PADDING_X, TITLE_Y, titleProgress);
    } else {
      ctx.globalAlpha = easeInOutCubic(titleProgress);
      ctx.fillText(title, PADDING_X, TITLE_Y);
      ctx.globalAlpha = 1;
    }

    // Enhanced underline with natural drawing
    const underlineProgress = Math.min(1, (progressWithinStep * stepMs) / UNDERLINE_MS);
    if (naturalAnimations) {
      drawNaturalUnderline(PADDING_X, TITLE_Y + 8, titleWidth + 8, underlineProgress);
    } else {
      drawScribbleUnderline(ctx, PADDING_X, TITLE_Y + 6, titleWidth + 8, underlineProgress);
    }

    // Enhanced description with typewriter effect
    const desc = step.description || "";
    ctx.font = "18px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#2d3748";
    const words = desc.trim().length ? desc.trim().split(/\s+/) : [];

    const revealMs = Math.max(MIN_STEP_MS * 0.8, stepMs * 0.85);
    const revealRatio = isPlaying ? clamp((progressWithinStep * stepMs) / revealMs, 0, 1) : 1;
    const visibleWords = Math.max(0, Math.floor(words.length * revealRatio));

    if (naturalAnimations) {
      drawWrappedWordsNatural(ctx, words, visibleWords, PADDING_X, DESC_Y, CANVAS_W - 2 * PADDING_X, DESC_LINE_H, revealRatio);
    } else {
      drawWrappedWords(ctx, words, visibleWords, PADDING_X, DESC_Y, CANVAS_W - 2 * PADDING_X, DESC_LINE_H);
    }

    // Visual prompt with enhanced styling
    if ((step as any).visualPrompt) {
      ctx.font = "italic 16px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#718096";
      const promptText = `💡 Visualize: ${(step as any).visualPrompt}`;
      ctx.fillText(promptText, PADDING_X, canvas.height - 30);
    }
  };

  // Enhanced word drawing with natural effects
  function drawWrappedWordsNatural(
    ctx: CanvasRenderingContext2D,
    words: string[],
    visibleWords: number,
    x: number,
    y: number,
    maxWidth: number,
    lineH: number,
    overallProgress: number
  ) {
    const display = words.slice(0, Math.max(0, visibleWords));
    let line = "";
    let currentY = y;

    for (let i = 0; i < display.length; i++) {
      const word = display[i];
      const test = line ? `${line} ${word}` : word;
      const w = ctx.measureText(test).width;
      
      if (w > maxWidth && line) {
        // Draw current line with natural effect
        const wordProgress = Math.min(1, (overallProgress * words.length - (i - line.split(' ').length)) / line.split(' ').length);
        naturalHandwriting(ctx, line, x, currentY, Math.max(0, wordProgress), 0.3);
        currentY += lineH;
        line = word;
      } else {
        line = test;
      }
    }
    
    if (line) {
      const wordProgress = Math.min(1, (overallProgress * words.length - (display.length - line.split(' ').length)) / line.split(' ').length);
      naturalHandwriting(ctx, line, x, currentY, Math.max(0, wordProgress), 0.3);
    }
  }

  // Fallback drawing functions
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

  function drawScribbleUnderline(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    p: number
  ) {
    const segments = Math.max(8, Math.floor(w / 24));
    const drawn = Math.floor(segments * p);
    const amp = 1.8;

    ctx.save();
    ctx.strokeStyle = "#f59e0b";
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

  // Animation loop
  useEffect(() => {
    if (!canvasRef.current || steps.length === 0) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const loop = () => {
      const p = progressWithinCurrentStep();
      drawStep(ctx, p);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [steps, currentStepIndex, isPlaying, effectiveSpeed, cues, totalMs, useAIVoice, naturalAnimations]);

  // Cleanup
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

  // Enhanced timing functions
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

  const stepWindowMs = () => {
    if (!cues.length || cues.length !== steps.length) {
      return Math.max(MIN_STEP_MS, baseStepMs());
    }
    const start = cues[currentStepIndex] ?? 0;
    const end = cues[currentStepIndex + 1] ?? totalMs;
    return Math.max(MIN_STEP_MS, end - start);
  };

  const baseStepMs = () =>
    Math.max(MIN_STEP_MS, (baseStepDurationMs / clampRate(effectiveSpeed)) || MIN_STEP_MS);

  const progressWithinCurrentStep = () => {
    if (!cues.length || cues.length !== steps.length) {
      const ms = currentClockMs() % baseStepMs();
      return clamp(ms / baseStepMs(), 0, 1);
    }
    const start = cues[currentStepIndex] ?? 0;
    const end = cues[currentStepIndex + 1] ?? totalMs;
    const windowMs = Math.max(MIN_STEP_MS, end - start);
    const ms = clamp(currentClockMs() - start, 0, windowMs);
    return clamp(ms / windowMs, 0, 1);
  };

  // Enhanced step synchronization with page following
  useEffect(() => {
    if (!useAIVoice || !audioRef.current || cues.length === 0) return;
    const el = audioRef.current;

    const onTimeUpdate = () => {
      const t = el.currentTime * 1000;
      let idx = currentStepIndex;
      while (idx + 1 < cues.length && t >= cues[idx + 1]) idx++;
      while (idx > 0 && t < cues[idx]) idx--;
      
      if (idx !== currentStepIndex) {
        setCurrentStepIndex(idx);
        // Follow to corresponding page if available
        if (onPageChange && steps[idx] && (steps[idx] as any).pageNumber) {
          onPageChange((steps[idx] as any).pageNumber);
        }
      }
    };

    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, [useAIVoice, cues, currentStepIndex, onPageChange, steps]);

  // Enhanced TTS with natural voice
  const startTtsLoop = () => {
    clearTtsTimer();
    ttsStartRef.current = performance.now();
    ttsTimerRef.current = window.setInterval(() => {
      if (ttsStartRef.current == null) return;
      const elapsedNow = (performance.now() - ttsStartRef.current) * clampRate(effectiveSpeed);
      const elapsed = ttsElapsedRef.current + elapsedNow;

      let idx = 0;
      while (idx + 1 < cues.length && elapsed >= cues[idx + 1]) idx++;
      
      if (idx !== currentStepIndex) {
        setCurrentStepIndex(idx);
        // Follow to corresponding page
        if (onPageChange && steps[idx] && (steps[idx] as any).pageNumber) {
          onPageChange((steps[idx] as any).pageNumber);
        }
      }

      if (elapsed >= totalMs && totalMs > 0) {
        stop();
      }
    }, 100) as unknown as number;
  };

  // Enhanced speech function
  const speakWithNaturalVoice = (text: string) => {
    if (!text.trim()) return;
    
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    utterance.rate = speechRate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      setCurrentUtterance(null);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setCurrentUtterance(null);
    };
    
    setCurrentUtterance(utterance);
    speechSynthesis.speak(utterance);
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
        speakWithNaturalVoice(trimmed);
        startTtsLoop();
      } else {
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
      speechSynthesis.pause();
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
      speechSynthesis.resume();
      startTtsLoop();
    }
    setIsPlaying(true);
  };

  const stop = () => {
    pause();
    setCurrentStepIndex(0);
    if (useAIVoice && audioRef.current) audioRef.current.currentTime = 0;
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
    }
    ttsElapsedRef.current = 0;
    ttsStartRef.current = null;
    clearTtsTimer();
    setIsSpeaking(false);
    setCurrentUtterance(null);
  };

  const prevStep = () => {
    const newIdx = Math.max(0, currentStepIndex - 1);
    setCurrentStepIndex(newIdx);
    if (onPageChange && steps[newIdx] && (steps[newIdx] as any).pageNumber) {
      onPageChange((steps[newIdx] as any).pageNumber);
    }
  };

  const nextStep = () => {
    const newIdx = Math.min(steps.length - 1, currentStepIndex + 1);
    setCurrentStepIndex(newIdx);
    if (onPageChange && steps[newIdx] && (steps[newIdx] as any).pageNumber) {
      onPageChange((steps[newIdx] as any).pageNumber);
    }
  };

  // Respond to parent speed changes
  useEffect(() => {
    if (!isPlaying) return;
    if (useAIVoice && audioRef.current) {
      audioRef.current.playbackRate = clampRate(effectiveSpeed);
    } else if (currentUtterance) {
      // For TTS, we need to restart with new rate
      const currentText = currentUtterance.text;
      speechSynthesis.cancel();
      setTimeout(() => speakWithNaturalVoice(currentText), 100);
    }
  }, [effectiveSpeed, isPlaying, useAIVoice, currentUtterance]);

  const onLocalSpeedChange = (val: number) => {
    setLocalSpeed(val);
    if (typeof playbackSpeed !== "number") {
      if (useAIVoice && audioRef.current) {
        audioRef.current.playbackRate = clampRate(val);
      }
    }
  };

  // Notes management
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
      } else {
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

  // Export functions
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

  const exportPDF = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "letter" });

      let y = 40;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(lessonTitle, 40, y);
      y += 24;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);

      doc.text("Narration Script:", 40, y);
      y += 16;
      y = addWrappedText(doc, narrationScript || "—", 40, y, 520, 14);
      y += 10;

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

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="border rounded bg-white shadow-lg"
        />

        {/* Enhanced sticky notes overlay */}
        <div className="absolute right-3 top-3 w-80 max-w-[90vw] bg-white/95 text-gray-900 rounded-lg shadow-lg border border-gray-200 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                  isOnline ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700"
                }`}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    isOnline ? "bg-emerald-500" : "bg-gray-400"
                  }`}
                />
                {isOnline ? "Online" : "Offline"}
              </span>
              {!lessonId && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs">
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

      {/* Enhanced audio element */}
      {useAIVoice && (
        <audio
          ref={audioRef}
          src={audioURL ?? undefined}
          onEnded={stop}
          className="hidden"
          controls
        />
      )}

      {/* Enhanced controls */}
      <div className="flex flex-col gap-4 w-full max-w-4xl">
        {/* Voice Controls */}
        <div className="flex items-center gap-4 p-3 bg-gray-100 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Voice:</span>
            <select
              className="text-sm bg-white border rounded px-2 py-1"
              value={selectedVoice?.name || ''}
              onChange={(e) => {
                const voice = availableVoices.find(v => v.name === e.target.value);
                if (voice && onVoiceChange) onVoiceChange(voice);
              }}
            >
              <option value="">Default</option>
              {availableVoices
                .filter(v => v.lang.startsWith('en'))
                .map(voice => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))
              }
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Speed:</span>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speechRate}
              onChange={(e) => onSpeechRateChange?.(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-sm">{speechRate}x</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="naturalAnimations"
              checked={naturalAnimations}
              onChange={(e) => {
                // This would need to be passed as a prop handler
                console.log('Natural animations:', e.target.checked);
              }}
            />
            <label htmlFor="naturalAnimations" className="text-sm">Natural Animations</label>
          </div>

          {isSpeaking && (
            <div className="flex items-center gap-2 text-blue-600">
              <span className="animate-pulse">🔊</span>
              <span className="text-sm">Speaking...</span>
            </div>
          )}
        </div>

        {/* Transport Controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={prevStep}
            className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={currentStepIndex <= 0}
          >
            ◀ Prev
          </button>

          {!isPlaying ? (
            <button
              onClick={currentStepIndex === 0 ? play : resume}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
            >
              ▶️ {currentStepIndex === 0 ? "Play" : "Resume"}
            </button>
          ) : (
            <button
              onClick={pause}
              className="bg-gray-700 hover:bg-gray-800 text-white px-6 py-2 rounded"
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
            className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={currentStepIndex >= steps.length - 1}
          >
            Next ▶
          </button>

          {/* Speed control (if not parent-controlled) */}
          {typeof playbackSpeed !== "number" && (
            <>
              <label className="ml-4 text-sm opacity-80">Speed</label>
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

          <span className="text-sm opacity-80 ml-4">
            Step {Math.min(currentStepIndex + 1, steps.length)} / {steps.length}
          </span>
        </div>

        {/* Export Controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={exportMarkdown}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
          >
            📄 Export Markdown
          </button>
          <button
            onClick={exportPDF}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"
          >
            🧾 Export PDF
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Utility Functions                                                  */
/* ------------------------------------------------------------------ */

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function clampRate(v: number) {
  return Math.min(2, Math.max(0.5, v || 1));
}

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

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
