// components/reader/PodcastLab.tsx
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import type { PodcastMode, PodcastScript, PodcastSegment } from "@/lib/podcast/podcastTypes";
import { PODCAST_MODES, SEGMENT_COLORS, SEGMENT_LABELS } from "@/lib/podcast/podcastTypes";
import { getAllUltraNotes } from "@/lib/notelab/ultraNoteStore";
import { getAllRecallSets } from "@/lib/recalllab/recallStore";
import { formulaToSpeech } from "@/lib/speech/studySpeechEngine";
import { normalizeFormulasForSpeech } from "@/lib/speech/formulaNormalization";
import { detectSubjectType } from "@/lib/podcast/podcastEngine";

interface Props {
  studyModel: CurrentPageStudyModel | null;
  pageNumber: number;
  bookId: string;
  activePageText?: string;
  onEvidenceFocus?: (id: string | null) => void;
  initialScript?: PodcastScript | null;
}

type PlayState = "idle" | "loading" | "playing" | "paused";

// Per-mode visual config — all modes use dark background
const MODE_CONFIG: Record<PodcastMode, {
  accent: string;          // tailwind bg class for active elements
  accentText: string;      // hex color for accents
  badge: string;           // mode badge label
  headerTitle: string;
  headerSub: string;
  showHighYield: boolean;
  showClinical: boolean;
  showQuiz: boolean;
}> = {
  page_review: {
    accent: "bg-blue-600",
    accentText: "#3b82f6",
    badge: "PROFESSOR",
    headerTitle: "Page Review",
    headerSub: "Professor-style concept walkthrough",
    showHighYield: false, showClinical: false, showQuiz: false,
  },
  exam_cram: {
    accent: "bg-red-600",
    accentText: "#dc2626",
    badge: "EXAM CRAM",
    headerTitle: "Exam Cram",
    headerSub: "High-yield rapid review · dense facts only",
    showHighYield: true, showClinical: false, showQuiz: false,
  },
  quiz_podcast: {
    accent: "bg-yellow-400",
    accentText: "#facc15",
    badge: "QUIZ SHOW",
    headerTitle: "Recall Challenge",
    headerSub: "Game-show quiz session",
    showHighYield: false, showClinical: false, showQuiz: true,
  },
  debate: {
    accent: "bg-emerald-500",
    accentText: "#10b981",
    badge: "DISCUSSION",
    headerTitle: "Avrrio Rounds",
    headerSub: "Classroom debate · evidence-backed",
    showHighYield: false, showClinical: false, showQuiz: false,
  },
  clinical: {
    accent: "bg-cyan-400",
    accentText: "#22d3ee",
    badge: "CASE",
    headerTitle: "Clinical Conference",
    headerSub: "Applied scenario · case-based",
    showHighYield: false, showClinical: true, showQuiz: false,
  },
};

function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function speakerColorClass(speaker: string): string {
  if (speaker === "host")    return "text-blue-300";
  if (speaker === "guest")   return "text-emerald-300";
  return "text-slate-400";
}

// Apply formula normalization + formulaToSpeech to segment text
function prepareSegmentForTTS(text: string): string {
  const { text: normalized, transformations, hasMath, hasScience } = normalizeFormulasForSpeech(text);
  if (transformations > 0) {
    console.log("[PODCAST_FORMULA_NORMALIZATION]", { transformations, hasMath, hasScience, preview: text.slice(0, 60) });
  }
  return formulaToSpeech(normalized).slice(0, 500);
}

export default function PodcastLab({
  studyModel,
  pageNumber,
  bookId,
  activePageText = "",
  onEvidenceFocus,
  initialScript,
}: Props) {
  const [mode, setMode]               = useState<PodcastMode>("page_review");
  const [script, setScript]           = useState<PodcastScript | null>(null);
  const [generating, setGenerating]   = useState(false);
  const [genError, setGenError]       = useState<string | null>(null);
  const [playState, setPlayState]     = useState<PlayState>("idle");
  const [segIdx, setSegIdx]           = useState(0);
  const [quizCountdown, setQuizCountdown] = useState<number | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [playbackSpeed, setPlaybackSpeed]   = useState(1.0);
  const [elapsed, setElapsed]               = useState(0);
  const [segDuration, setSegDuration]       = useState(0);

  const abortRef        = useRef(false);
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCacheRef   = useRef<Map<string, Blob>>(new Map());
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [audioReady, setAudioReady] = useState(false);

  const cfg = MODE_CONFIG[mode];
  const subject = useMemo(() => detectSubjectType(activePageText, studyModel ?? undefined), [activePageText, studyModel]);

  useEffect(() => {
    setScript(null);
    setGenError(null);
    setPlayState("idle");
    setSegIdx(0);
    setQuizCountdown(null);
    setAudioReady(false);
    setElapsed(0);
    setSegDuration(0);
    audioCacheRef.current.clear();
    abortRef.current = true;
  }, [pageNumber, bookId, mode]);

  useEffect(() => () => {
    if (countdownRef.current)    clearInterval(countdownRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
  }, []);

  // Load initialScript when provided (e.g. from StudyGuideLab podcast handoff)
  useEffect(() => {
    if (initialScript) {
      setScript(initialScript);
      setPlayState("idle");
      setSegIdx(0);
    }
  }, [initialScript]);

  // ── Script generation ──────────────────────────────────────────────────
  const generateScript = useCallback(async () => {
    if (!studyModel) return;
    setGenerating(true);
    setGenError(null);
    setScript(null);
    setPlayState("idle");
    setSegIdx(0);

    const noteLab   = getAllUltraNotes().filter((n) => n.bookId === bookId && n.pageNumber === pageNumber);
    const recallLab = getAllRecallSets().filter((r)  => r.bookId === bookId && r.pageNumber === pageNumber);

    console.log("[PODCAST_SOURCE]",    { page: pageNumber, bookId, mode, visualAnchors: studyModel.visualAnchors.length, noteLab: noteLab.length, recallLab: recallLab.length });
    console.log("[PODCAST_MODE_STYLE]", { mode, title: cfg.headerTitle, sub: cfg.headerSub, subject });

    try {
      const res = await fetch("/api/podcast-script", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            pageNumber, bookId,
            pageText:   activePageText.slice(0, 800),
            studyModel: {
              pageThesis:    studyModel.pageThesis,
              studyNotes:    studyModel.studyNotes,
              conceptBlocks: studyModel.conceptBlocks.slice(0, 3),
              visualAnchors: studyModel.visualAnchors.slice(0, 6),
            },
            noteLab, recallLab,
          },
          mode,
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data: PodcastScript = await res.json();
      setScript(data);
      console.log("[PODCAST_SCRIPT_CREATED]", { page: pageNumber, mode, segments: data.totalSegments });
      prebufferSegments(data.segments);
    } catch (err: any) {
      setGenError(err?.message ?? "Failed to generate script");
    } finally {
      setGenerating(false);
    }
  }, [studyModel, pageNumber, bookId, mode, activePageText, cfg, subject]);

  // ── Pre-buffer ────────────────────────────────────────────────────────
  const fetchBlob = useCallback(async (text: string, voice: string): Promise<Blob | null> => {
    try {
      const res  = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ script: text, voice }),
      });
      const data = await res.json();
      if (data.audioBase64) {
        const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
        return new Blob([bytes], { type: data.mimeType ?? "audio/mpeg" });
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const prebufferSegments = useCallback(async (segs: PodcastSegment[]) => {
    setAudioReady(false);
    const modeInfo = PODCAST_MODES.find((m) => m.id === mode)!;
    await Promise.all(segs.map(async (s) => {
      const voice = s.speaker === "guest" ? modeInfo.guestVoice : modeInfo.hostVoice;
      const blob  = await fetchBlob(prepareSegmentForTTS(s.text), voice);
      if (blob) audioCacheRef.current.set(s.id, blob);
    }));
    setAudioReady(true);
    console.log("[PODCAST_AUDIO_PLAYER_READY]", { mode, segments: segs.length, cached: audioCacheRef.current.size });
  }, [mode, fetchBlob]);

  // ── Stop ──────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    abortRef.current = true;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (countdownRef.current)    { clearInterval(countdownRef.current);    countdownRef.current    = null; }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    setQuizCountdown(null);
    setElapsed(0);
    setSegDuration(0);
    setPlayState("idle");
    onEvidenceFocus?.(null);
  }, [onEvidenceFocus]);

  // ── Play a single blob ────────────────────────────────────────────────
  const playBlob = useCallback(async (blob: Blob): Promise<void> => {
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = playbackSpeed;
    audioRef.current = audio;
    await new Promise<void>((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(() => resolve());
    });
  }, [playbackSpeed]);

  const fetchAndPlay = useCallback(async (text: string, voice: string, segId?: string): Promise<void> => {
    if (segId && audioCacheRef.current.has(segId)) {
      if (!abortRef.current) await playBlob(audioCacheRef.current.get(segId)!);
      return;
    }
    try {
      const res  = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ script: text, voice }),
      });
      const data = await res.json();
      if (abortRef.current) return;

      if (data.useBrowserSpeech && typeof window !== "undefined" && "speechSynthesis" in window) {
        await new Promise<void>((resolve) => {
          const utt  = new SpeechSynthesisUtterance(data.script || text);
          utt.rate   = playbackSpeed;
          utt.onend  = () => resolve();
          utt.onerror = () => resolve(); // ← resolve on cancel so stop doesn't hang
          window.speechSynthesis.speak(utt);
        });
        return;
      }

      if (data.audioBase64 && !abortRef.current) {
        const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
        const blob  = new Blob([bytes], { type: data.mimeType ?? "audio/mpeg" });
        await playBlob(blob);
      }
    } catch { /* silent */ }
  }, [playBlob, playbackSpeed]);

  const runCountdown = useCallback((seconds: number): Promise<void> =>
    new Promise<void>((resolve) => {
      setQuizCountdown(seconds);
      let remaining = seconds;
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          setQuizCountdown(null);
          resolve();
        } else {
          setQuizCountdown(remaining);
        }
      }, 1000);
    }), []);

  // ── Playback loop ─────────────────────────────────────────────────────
  const playFrom = useCallback(async (startIdx: number) => {
    if (!script) return;
    abortRef.current = false;
    setPlayState("playing");
    const modeInfo = PODCAST_MODES.find((m) => m.id === mode)!;

    for (let i = startIdx; i < script.segments.length; i++) {
      if (abortRef.current) break;
      const seg = script.segments[i];
      setSegIdx(i);

      const wordCount = seg.text.trim().split(/\s+/).length;
      const estDuration = Math.round((wordCount / 140) * 60);
      setSegDuration(estDuration);
      setElapsed(0);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);

      if (seg.anchorId) onEvidenceFocus?.(seg.anchorId);
      console.log("[PODCAST_SEGMENT_START]", { segIdx: i, type: seg.type, speaker: seg.speaker, chars: seg.text.length });

      if (mode === "quiz_podcast" && seg.type === "recall_quiz" && !abortRef.current) {
        await runCountdown(5);
      }
      if (abortRef.current) break;

      const voice = seg.speaker === "guest" ? modeInfo.guestVoice : modeInfo.hostVoice;
      await fetchAndPlay(prepareSegmentForTTS(seg.text), voice, seg.id);

      if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
      if (abortRef.current) break;
    }

    if (!abortRef.current) {
      setPlayState("idle");
      setElapsed(0);
      setSegDuration(0);
      onEvidenceFocus?.(null);
    }
  }, [script, mode, onEvidenceFocus, fetchAndPlay, runCountdown]);

  const handlePlay = useCallback(() => {
    if (playState === "playing") stop();
    else playFrom(playState === "paused" ? segIdx : 0);
  }, [playState, segIdx, playFrom, stop]);

  const handleSegmentClick = useCallback((idx: number) => {
    stop();
    setTimeout(() => playFrom(idx), 80);
  }, [stop, playFrom]);

  // ── Derived ───────────────────────────────────────────────────────────
  const currentSeg = script?.segments[segIdx];
  const noteLabCount   = studyModel ? getAllUltraNotes().filter((n) => n.bookId === bookId && n.pageNumber === pageNumber).length : 0;
  const recallCount    = studyModel ? getAllRecallSets().filter((r) => r.bookId === bookId && r.pageNumber === pageNumber).reduce((s, r) => s + r.cards.length, 0) : 0;
  const progressFrac   = script ? Math.min(1, (segIdx + elapsed / Math.max(segDuration, 1)) / script.totalSegments) : 0;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[#060d18] text-white overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🎙️</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">PodcastLab</span>
              <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${cfg.accent} text-white`}>
                {cfg.badge}
              </span>
            </div>
            <div className="text-[13px] font-semibold text-white/90">{cfg.headerTitle}</div>
            <div className="text-[10px] text-white/35 mt-0.5">{cfg.headerSub}</div>
          </div>
        </div>
        {script && (
          <div className="text-[10px] text-white/25">{script.totalSegments} seg · ~{script.estimatedMinutes} min</div>
        )}
      </div>

      {/* Mode selector */}
      <div className="px-3 pt-3 pb-2 border-b border-white/6 shrink-0">
        <div className="text-[9px] font-bold uppercase tracking-widest text-white/25 mb-2">Mode</div>
        <div className="flex flex-wrap gap-1.5">
          {PODCAST_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              title={m.description}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                mode === m.id
                  ? `${MODE_CONFIG[m.id].accent} border-transparent text-white`
                  : "bg-white/5 border-white/8 text-white/55 hover:bg-white/10 hover:text-white/85"
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Source info */}
      {studyModel && (
        <div className="px-3 py-2 shrink-0">
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className="px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300/80 border border-emerald-700/20">✓ Right Panel ({studyModel.visualAnchors.length})</span>
            {noteLabCount > 0 && <span className="px-2 py-0.5 rounded bg-green-900/40 text-green-300/80 border border-green-700/20">✓ NoteLab ({noteLabCount})</span>}
            {recallCount  > 0 && <span className="px-2 py-0.5 rounded bg-purple-900/40 text-purple-300/80 border border-purple-700/20">✓ RecallLab ({recallCount})</span>}
          </div>
        </div>
      )}

      {/* Generate */}
      {!script && (
        <div className="px-3 pb-3 shrink-0">
          <button
            onClick={generateScript}
            disabled={!studyModel || generating}
            className={`w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white shadow ${cfg.accent} hover:opacity-90`}
          >
            {generating ? "Generating podcast…" : !studyModel ? "Waiting for Right Panel…" : "🎙️ Generate Podcast"}
          </button>
          {genError && <p className="mt-2 text-[11px] text-red-400/80 text-center">{genError}</p>}
        </div>
      )}

      {/* Scrollable */}
      <div className="flex-1 overflow-y-auto flex flex-col">

        {/* Quiz countdown */}
        {mode === "quiz_podcast" && quizCountdown !== null && (
          <div className="mx-3 mt-3 rounded-xl bg-yellow-400 text-indigo-950 flex items-center justify-center gap-3 py-4 shrink-0">
            <span className="text-3xl font-black tabular-nums">{quizCountdown}</span>
            <span className="text-[13px] font-bold">Get ready to answer…</span>
          </div>
        )}

        {/* Audio player */}
        {script && (
          <div className="mx-3 mt-3 rounded-2xl border border-white/8 bg-white/4 p-4 shrink-0">
            {/* Now playing */}
            <div className="mb-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-0.5">{cfg.headerTitle}</div>
              {currentSeg && (
                <div className="text-[13px] font-semibold leading-tight">
                  <span className={speakerColorClass(currentSeg.speaker)}>
                    {currentSeg.speaker === "host" ? "Host" : currentSeg.speaker === "guest" ? "Guest" : "Narrator"}
                  </span>
                  <span className="text-white/35 font-normal ml-1.5">· {SEGMENT_LABELS[currentSeg.type]}</span>
                  {cfg.showHighYield && (currentSeg.type === "right_panel_note" || currentSeg.type === "highlight_evidence") && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] font-black bg-red-600 text-white tracking-widest align-middle">HIGH YIELD</span>
                  )}
                </div>
              )}
              {!currentSeg && (
                <div className="text-[13px] text-white/60">{script.totalSegments} segments · ~{script.estimatedMinutes} min</div>
              )}
            </div>

            {/* Progress bar */}
            <div
              className="relative h-1.5 rounded-full mb-2 overflow-hidden bg-white/10 cursor-pointer"
              onClick={(e) => {
                if (!script) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const frac = (e.clientX - rect.left) / rect.width;
                handleSegmentClick(Math.max(0, Math.min(script.totalSegments - 1, Math.floor(frac * script.totalSegments))));
              }}
            >
              <div className={`h-full rounded-full transition-all duration-300 ${cfg.accent}`} style={{ width: `${progressFrac * 100}%` }} />
            </div>

            {/* Time */}
            <div className="flex justify-between text-[9px] text-white/30 mb-4">
              <span>{playState === "playing" ? fmtTime(elapsed) : "0:00"}</span>
              <span>{segIdx + 1} / {script.totalSegments}</span>
              <span>~{fmtTime(script.estimatedMinutes * 60)}</span>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mb-3">
              <button onClick={() => handleSegmentClick(Math.max(0, segIdx - 1))} disabled={segIdx === 0}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 text-white/70 disabled:opacity-30 transition-all" title="Previous">⏮</button>
              <button onClick={() => handleSegmentClick(Math.max(0, segIdx - 1))}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 text-white/70 text-[11px] font-bold transition-all" title="Skip back">⟨10</button>
              <button onClick={handlePlay}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shadow-lg transition-all text-white ${playState === "playing" ? "bg-red-600 hover:bg-red-500" : `${cfg.accent} hover:opacity-90`}`}>
                {playState === "playing" ? "⏸" : "▶"}
              </button>
              <button onClick={() => handleSegmentClick(Math.min(script.totalSegments - 1, segIdx + 1))}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 text-white/70 text-[11px] font-bold transition-all" title="Skip forward">10⟩</button>
              <button onClick={() => handleSegmentClick(Math.min(script.totalSegments - 1, segIdx + 1))} disabled={segIdx >= script.totalSegments - 1}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 text-white/70 disabled:opacity-30 transition-all" title="Next">⏭</button>
            </div>

            {/* Speed + secondary */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {[0.75, 1, 1.25, 1.5].map((s) => (
                  <button key={s}
                    onClick={() => { setPlaybackSpeed(s); if (audioRef.current) audioRef.current.playbackRate = s; }}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                      playbackSpeed === s ? `${cfg.accent} text-white` : "bg-white/8 text-white/50 hover:bg-white/15"
                    }`}>
                    {s}×
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={() => setShowTranscript((v) => !v)}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all ${
                    showTranscript ? `${cfg.accent} text-white` : "bg-white/8 text-white/50 hover:bg-white/15"
                  }`}>
                  ≡ Transcript
                </button>
                <button onClick={() => { setScript(null); setGenError(null); }} className="text-[10px] text-white/25 hover:text-white/50 transition-colors">
                  Regenerate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transcript */}
        {script && showTranscript && (
          <div className="px-3 py-2 mt-1 space-y-1.5">
            {script.segments.map((seg, idx) => {
              const isActive = playState === "playing" && idx === segIdx;
              const isHY     = cfg.showHighYield && (seg.type === "right_panel_note" || seg.type === "highlight_evidence");
              return (
                <button key={seg.id} onClick={() => handleSegmentClick(idx)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                    isActive ? "bg-blue-900/40 border-blue-500/40" : "bg-white/3 border-white/6 hover:bg-white/7"
                  } ${SEGMENT_COLORS[seg.type]}`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[9px] font-bold uppercase tracking-widest ${speakerColorClass(seg.speaker)}`}>
                      {seg.speaker === "host" ? "HOST" : seg.speaker === "guest" ? "GUEST" : "NARRATOR"}
                    </span>
                    <span className="text-[9px] text-white/25 uppercase">{SEGMENT_LABELS[seg.type]}</span>
                    {isHY && <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-red-600 text-white">HIGH YIELD</span>}
                    {seg.anchorId && <span className="ml-auto text-[9px] text-amber-400/50">⚓ {seg.anchorId}</span>}
                  </div>
                  <p className={`text-[12px] leading-relaxed line-clamp-3 ${isActive ? "text-white/95" : "text-white/55"}`}>{seg.text}</p>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex-1" />
      </div>

      {/* Empty state */}
      {!script && !generating && !studyModel && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="text-3xl">🎙️</span>
          <p className="text-[12px] text-white/35 leading-relaxed">Open a page in the Reader to activate PodcastLab. The Right Panel must synthesize first.</p>
        </div>
      )}
    </div>
  );
}
