// components/reader/PodcastLab.tsx
// Advanced study discussion panel — aggregates finalStudyModel, visualAnchors,
// NoteLab, RecallLab, and page text into a structured podcast.
// Each mode renders in its own studio environment.

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import type { PodcastMode, PodcastScript, PodcastSegment } from "@/lib/podcast/podcastTypes";
import { PODCAST_MODES, SEGMENT_COLORS, SEGMENT_LABELS } from "@/lib/podcast/podcastTypes";
import { getAllUltraNotes } from "@/lib/notelab/ultraNoteStore";
import { getAllRecallSets } from "@/lib/recalllab/recallStore";
import { formulaToSpeech } from "@/lib/speech/studySpeechEngine";
import { buildWhiteboardStepsFromStudyModel } from "@/lib/insights/whiteboardFromStudyModel";
import Whiteboard from "@/components/Whiteboard";

interface Props {
  studyModel: CurrentPageStudyModel | null;
  pageNumber: number;
  bookId: string;
  activePageText?: string;
  onEvidenceFocus?: (id: string | null) => void;
}

type PlayState = "idle" | "loading" | "playing" | "paused";

// ── Studio configs per mode ────────────────────────────────────────────────

const STUDIO_CONFIG: Record<PodcastMode, {
  bg: string;
  textClass: string;
  accentClass: string;
  hostLabel: string;
  guestLabel: string;
  headerTitle: string;
  headerSubtitle: string;
  isDark: boolean;
}> = {
  page_review: {
    bg: "from-slate-50 via-blue-50 to-indigo-50",
    textClass: "text-slate-800",
    accentClass: "bg-blue-600",
    hostLabel: "Professor",
    guestLabel: "Student",
    headerTitle: "Page Review Studio",
    headerSubtitle: "Whiteboard-first concept walk-through",
    isDark: false,
  },
  exam_cram: {
    bg: "from-gray-950 via-gray-900 to-red-950",
    textClass: "text-white",
    accentClass: "bg-red-600",
    hostLabel: "Prof. Carter",
    guestLabel: "Dr. Elena",
    headerTitle: "DAT Review Studio",
    headerSubtitle: "High-yield exam prep · dense review",
    isDark: true,
  },
  quiz_podcast: {
    bg: "from-indigo-950 via-purple-900 to-pink-950",
    textClass: "text-white",
    accentClass: "bg-yellow-400",
    hostLabel: "Host",
    guestLabel: "Contestant",
    headerTitle: "Recall Challenge Studio",
    headerSubtitle: "Game show study session",
    isDark: true,
  },
  debate: {
    bg: "from-slate-950 via-slate-900 to-slate-800",
    textClass: "text-white",
    accentClass: "bg-green-500",
    hostLabel: "Advocate",
    guestLabel: "Challenger",
    headerTitle: "Avrrio Rounds Studio",
    headerSubtitle: "Evidence-backed debate",
    isDark: true,
  },
  clinical: {
    bg: "from-teal-950 via-teal-900 to-cyan-950",
    textClass: "text-white",
    accentClass: "bg-cyan-400",
    hostLabel: "Attending",
    guestLabel: "Resident",
    headerTitle: "Clinical Conference Room",
    headerSubtitle: "Symptom → Mechanism → Diagnosis → Treatment",
    isDark: true,
  },
};

// Clinical breadcrumb step derived from segment type
function clinicalStep(seg: PodcastSegment): number {
  if (seg.type === "intro" || seg.type === "page_reading") return 0;
  if (seg.type === "highlight_evidence") return 1;
  if (seg.type === "right_panel_note") return 2;
  if (seg.type === "notelab_expansion") return 3;
  return -1;
}

const CLINICAL_STEPS = ["Symptom", "Mechanism", "Diagnosis", "Treatment"];

// Maps segment sourceField/type → whiteboard step index
// Matches the order from buildWhiteboardStepsFromStudyModel:
//   0=pageThesis, 1=whyThisMatters, 2=keyMechanism, 3=commonConfusion, 4+=conceptBlocks
function sourceFieldToWbStep(seg: PodcastSegment): number {
  if (seg.sourceField === "whyThisMatters")  return 1;
  if (seg.sourceField === "keyMechanism")    return 2;
  if (seg.sourceField === "commonConfusion") return 3;
  if (seg.sourceField === "quickMemory")     return 3;
  if (seg.type === "intro")                  return 0;
  if (seg.type === "page_reading")           return 0;
  if (seg.type === "highlight_evidence")     return 2;
  if (seg.type === "right_panel_note")       return 4;
  if (seg.type === "notelab_expansion")      return 4;
  return -1;
}

function speakerColor(speaker: string, isDark: boolean): string {
  if (isDark) {
    if (speaker === "host")  return "text-blue-300";
    if (speaker === "guest") return "text-emerald-300";
    return "text-slate-400";
  }
  if (speaker === "host")  return "text-blue-700";
  if (speaker === "guest") return "text-emerald-700";
  return "text-slate-500";
}

export default function PodcastLab({
  studyModel,
  pageNumber,
  bookId,
  activePageText = "",
  onEvidenceFocus,
}: Props) {
  const [mode, setMode]             = useState<PodcastMode>("page_review");
  const [script, setScript]         = useState<PodcastScript | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState<string | null>(null);
  const [playState, setPlayState]   = useState<PlayState>("idle");
  const [segIdx, setSegIdx]         = useState(0);
  const [quizCountdown, setQuizCountdown] = useState<number | null>(null);
  const [reviewStepIdx, setReviewStepIdx] = useState(0);

  const abortRef     = useRef(false);
  const audioRef     = useRef<HTMLAudioElement | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCacheRef = useRef<Map<string, Blob>>(new Map());
  const [audioReady, setAudioReady] = useState(false);

  const cfg = STUDIO_CONFIG[mode];

  // Wipe script and audio cache when page or mode changes
  useEffect(() => {
    setScript(null);
    setGenError(null);
    setPlayState("idle");
    setSegIdx(0);
    setQuizCountdown(null);
    setAudioReady(false);
    audioCacheRef.current.clear();
    abortRef.current = true;
  }, [pageNumber, bookId, mode]);

  useEffect(() => () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  // Whiteboard steps for Page Review
  const wbSteps = useMemo(
    () => (studyModel ? buildWhiteboardStepsFromStudyModel(studyModel) : []),
    [studyModel],
  );

  // Source counts (stable — called at render, not inside effects)
  const noteLabCount = studyModel
    ? getAllUltraNotes().filter((n) => n.bookId === bookId && n.pageNumber === pageNumber).length
    : 0;
  const recallCardCount = studyModel
    ? getAllRecallSets()
        .filter((r) => r.bookId === bookId && r.pageNumber === pageNumber)
        .reduce((s, r) => s + r.cards.length, 0)
    : 0;

  // ── Script generation ──────────────────────────────────────────────────
  const generateScript = useCallback(async () => {
    if (!studyModel) return;
    setGenerating(true);
    setGenError(null);
    setScript(null);
    setPlayState("idle");
    setSegIdx(0);

    const noteLab   = getAllUltraNotes().filter((n) => n.bookId === bookId && n.pageNumber === pageNumber);
    const recallLab = getAllRecallSets().filter((r) => r.bookId === bookId && r.pageNumber === pageNumber);

    console.log("[PODCAST_SOURCE]", {
      page: pageNumber, bookId, mode,
      visualAnchors: studyModel.visualAnchors.length,
      noteLab: noteLab.length, recallLab: recallLab.length,
      pageTextChars: activePageText.length,
    });

    try {
      const res = await fetch("/api/podcast-script", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            pageNumber, bookId,
            pageText: activePageText.slice(0, 800),
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
      console.log("[PODCAST_SCRIPT_CREATED]", {
        page: pageNumber, mode, segments: data.totalSegments, estimatedMinutes: data.estimatedMinutes,
      });
      prebufferAllSegments(data.segments, mode);
    } catch (err: any) {
      setGenError(err?.message ?? "Failed to generate script");
    } finally {
      setGenerating(false);
    }
  }, [studyModel, pageNumber, bookId, mode, activePageText]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Audio blob fetch (single segment, no playback) ────────────────────
  const fetchAudioBlob = useCallback(async (text: string, voice: string): Promise<Blob | null> => {
    try {
      const res  = await fetch("/api/tts", {
        method:  "POST",
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

  // ── Pre-buffer: generate all segment audio in parallel after script ready ──
  const prebufferAllSegments = useCallback(async (seg: PodcastSegment[], modeId: PodcastMode) => {
    const modeInfo = PODCAST_MODES.find((m) => m.id === modeId)!;
    setAudioReady(false);
    console.log("[PODCAST_AUDIO_CLIP_CREATED]", { event: "prebuffer-start", segments: seg.length, mode: modeId });

    await Promise.all(
      seg.map(async (s, i) => {
        const voice = s.speaker === "guest" ? modeInfo.guestVoice : modeInfo.hostVoice;
        const blob  = await fetchAudioBlob(formulaToSpeech(s.text).slice(0, 500), voice);
        if (blob) {
          audioCacheRef.current.set(s.id, blob);
          console.log("[PODCAST_AUDIO_CLIP_CREATED]", { event: "cached", segIdx: i, segId: s.id, speaker: s.speaker });
        }
      })
    );

    setAudioReady(true);
    console.log("[PODCAST_AUDIO_CLIP_CREATED]", { event: "prebuffer-done", cachedCount: audioCacheRef.current.size, totalSegments: seg.length });
  }, [fetchAudioBlob]);

  // ── TTS playback ───────────────────────────────────────────────────────
  const stop = useCallback(() => {
    abortRef.current = true;
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setQuizCountdown(null);
    setPlayState("idle");
    onEvidenceFocus?.(null);
  }, [onEvidenceFocus]);

  const playBlob = useCallback(async (blob: Blob): Promise<void> => {
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    await new Promise<void>((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(() => resolve());
    });
  }, []);

  const fetchAndPlayAudio = useCallback(async (text: string, voice: string, segmentId?: string): Promise<void> => {
    // Use pre-buffered audio if available (zero latency path)
    if (segmentId && audioCacheRef.current.has(segmentId)) {
      const cached = audioCacheRef.current.get(segmentId)!;
      console.log("[PODCAST_TURN_SEQUENCE]", { event: "play-cached", segmentId, fetchMode: "cached" });
      if (!abortRef.current) await playBlob(cached);
      return;
    }

    // Live fetch fallback (first play before pre-buffer completes)
    try {
      const res = await fetch("/api/tts", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ script: text, voice }),
      });
      const data = await res.json();
      if (abortRef.current) return;

      if (data.useBrowserSpeech && typeof window !== "undefined" && "speechSynthesis" in window) {
        await new Promise<void>((resolve) => {
          const utt = new SpeechSynthesisUtterance(data.script || text);
          utt.rate  = 0.92;
          utt.onend = () => resolve();
          window.speechSynthesis.speak(utt);
        });
        return;
      }

      if (data.audioBase64) {
        const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
        const blob  = new Blob([bytes], { type: data.mimeType ?? "audio/mpeg" });
        if (!abortRef.current) await playBlob(blob);
      }
    } catch {
      // silent — continue to next segment
    }
  }, [playBlob]);

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

  const playFrom = useCallback(async (startIdx: number) => {
    if (!script) return;
    abortRef.current = false;
    setPlayState("playing");

    const modeInfo = PODCAST_MODES.find((m) => m.id === mode)!;

    for (let i = startIdx; i < script.segments.length; i++) {
      if (abortRef.current) break;
      const seg = script.segments[i];
      setSegIdx(i);

      if (seg.anchorId) {
        onEvidenceFocus?.(seg.anchorId);
        console.log("[PODCAST_SEGMENT_START]", {
          segIdx: i, type: seg.type, speaker: seg.speaker,
          anchorId: seg.anchorId, sourceField: seg.sourceField ?? null, chars: seg.text.length,
        });
      } else {
        console.log("[PODCAST_SEGMENT_START]", {
          segIdx: i, type: seg.type, speaker: seg.speaker, chars: seg.text.length,
        });
      }

      // Sync whiteboard step in Page Review
      if (mode === "page_review") {
        const wbIdx = sourceFieldToWbStep(seg);
        if (wbIdx >= 0) setReviewStepIdx(wbIdx);
      }

      // Quiz countdown before quiz segments
      if (mode === "quiz_podcast" && seg.type === "recall_quiz" && !abortRef.current) {
        await runCountdown(5);
      }

      if (abortRef.current) break;

      const voice = seg.speaker === "guest" ? modeInfo.guestVoice : modeInfo.hostVoice;
      await fetchAndPlayAudio(formulaToSpeech(seg.text).slice(0, 500), voice, seg.id);

      if (abortRef.current) break;
    }

    if (!abortRef.current) {
      setPlayState("idle");
      onEvidenceFocus?.(null);
    }
  }, [script, mode, onEvidenceFocus, fetchAndPlayAudio, runCountdown]);

  const handlePlay = useCallback(() => {
    if (playState === "playing") { stop(); }
    else { playFrom(playState === "paused" ? segIdx : 0); }
  }, [playState, segIdx, playFrom, stop]);

  const handleSegmentClick = useCallback((idx: number) => {
    stop();
    setTimeout(() => playFrom(idx), 80);
  }, [stop, playFrom]);

  // ── Render ─────────────────────────────────────────────────────────────

  const currentSeg: PodcastSegment | undefined = script?.segments[segIdx];
  const clinicalStepIdx = currentSeg ? clinicalStep(currentSeg) : -1;

  const borderClass = cfg.isDark ? "border-white/10" : "border-slate-200";
  const mutedText   = cfg.isDark ? "text-white/40"  : "text-slate-400";
  const bodyText    = cfg.isDark ? "text-white/90"  : "text-slate-800";

  return (
    <div className={`h-full flex flex-col bg-gradient-to-b ${cfg.bg} ${cfg.textClass} overflow-hidden`}>

      {/* Studio header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${borderClass} shrink-0`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🎙️</span>
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-widest ${mutedText}`}>PodcastLab</div>
            <div className={`text-[13px] font-semibold ${bodyText}`}>{cfg.headerTitle}</div>
            <div className={`text-[10px] ${mutedText} mt-0.5`}>{cfg.headerSubtitle}</div>
          </div>
        </div>
        {script && (
          <div className={`text-[10px] ${mutedText}`}>
            ~{script.estimatedMinutes} min · {script.totalSegments} segments
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div className={`px-3 pt-3 pb-2 border-b ${borderClass} shrink-0`}>
        <div className={`text-[9px] font-bold uppercase tracking-widest ${mutedText} mb-2`}>Mode</div>
        <div className="flex flex-wrap gap-1.5">
          {PODCAST_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              title={m.description}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                mode === m.id
                  ? `${cfg.accentClass} border-transparent text-white`
                  : cfg.isDark
                    ? "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90"
                    : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clinical breadcrumb */}
      {mode === "clinical" && playState === "playing" && (
        <div className="px-3 pt-2 pb-1 shrink-0">
          <div className="flex items-center gap-1 text-[10px]">
            {CLINICAL_STEPS.map((step, i) => (
              <React.Fragment key={step}>
                <span className={`px-2 py-0.5 rounded font-semibold transition-all ${
                  clinicalStepIdx === i ? "bg-cyan-400 text-teal-950" : "text-white/30"
                }`}>
                  {step}
                </span>
                {i < CLINICAL_STEPS.length - 1 && <span className="text-white/20">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Source info */}
      {studyModel && (
        <div className="px-3 py-2 shrink-0">
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className={`px-2 py-0.5 rounded border ${
              cfg.isDark
                ? "bg-emerald-900/40 text-emerald-300/80 border-emerald-600/20"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}>
              ✓ Right Panel ({studyModel.visualAnchors.length} anchors)
            </span>
            {noteLabCount > 0 && (
              <span className={`px-2 py-0.5 rounded border ${
                cfg.isDark
                  ? "bg-green-900/40 text-green-300/80 border-green-600/20"
                  : "bg-green-50 text-green-700 border-green-200"
              }`}>
                ✓ NoteLab ({noteLabCount})
              </span>
            )}
            {recallCardCount > 0 && (
              <span className={`px-2 py-0.5 rounded border ${
                cfg.isDark
                  ? "bg-purple-900/40 text-purple-300/80 border-purple-600/20"
                  : "bg-purple-50 text-purple-700 border-purple-200"
              }`}>
                ✓ RecallLab ({recallCardCount} cards)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Generate button */}
      {!script && (
        <div className="px-3 pb-3 shrink-0">
          <button
            onClick={generateScript}
            disabled={!studyModel || generating}
            className={`w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white shadow ${cfg.accentClass} hover:opacity-90`}
          >
            {generating ? "Generating podcast…" : !studyModel ? "Waiting for Right Panel…" : "🎙️ Generate Podcast"}
          </button>
          {genError && <p className="mt-2 text-[11px] text-red-400/80 text-center">{genError}</p>}
        </div>
      )}

      {/* Scrollable area */}
      <div className="flex-1 overflow-y-auto">

        {/* Page Review: animated whiteboard synced to audio */}
        {mode === "page_review" && studyModel && wbSteps.length > 0 && (
          <div className="mx-3 mb-1 rounded-xl overflow-hidden border border-blue-200 shadow-lg bg-white" style={{ height: 300 }}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-blue-600 text-white">
              <span className="text-[10px] font-bold uppercase tracking-widest">Live Whiteboard</span>
              {playState === "playing" && (
                <span className="flex items-center gap-1.5 text-[10px] text-blue-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  Step {Math.min(reviewStepIdx + 1, wbSteps.length)} of {wbSteps.length}
                </span>
              )}
            </div>
            <div style={{ height: 264 }}>
              <Whiteboard
                steps={wbSteps}
                concept={studyModel.pageThesis ?? ""}
                context=""
                baseStepDurationMs={5000}
                enableDrawing={false}
                controlledStepIndex={playState === "playing" ? reviewStepIdx : undefined}
              />
            </div>
          </div>
        )}

        {/* Quiz countdown */}
        {mode === "quiz_podcast" && quizCountdown !== null && (
          <div className="mx-3 mb-3 rounded-xl bg-yellow-400 text-indigo-950 flex items-center justify-center gap-3 py-4">
            <span className="text-3xl font-black tabular-nums">{quizCountdown}</span>
            <span className="text-[13px] font-bold">Get ready to answer…</span>
          </div>
        )}

        {/* Script */}
        {script && (
          <>
            {/* Playback bar */}
            <div className={`px-3 py-2 border-t border-b ${borderClass} flex items-center gap-3`}>
              <button
                onClick={handlePlay}
                className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all text-white ${
                  playState === "playing" ? "bg-red-600 hover:bg-red-500" : `${cfg.accentClass} hover:opacity-90`
                }`}
              >
                {playState === "playing" ? "⏹ Stop" : "▶ Play"}
              </button>
              <div className={`text-[10px] ${mutedText}`}>
                {playState === "playing"
                  ? `Playing ${segIdx + 1} / ${script.totalSegments}`
                  : `${script.totalSegments} segments · ~${script.estimatedMinutes} min`}
              </div>
              <button
                onClick={() => { setScript(null); setGenError(null); }}
                className={`ml-auto text-[10px] ${mutedText} hover:opacity-80 transition-colors`}
              >
                Regenerate
              </button>
            </div>

            {/* Active segment banner */}
            {playState === "playing" && currentSeg && (
              <div className={`mx-3 mt-2 px-3 py-2 rounded-xl border ${
                cfg.isDark ? "bg-blue-900/30 border-blue-500/30" : "bg-blue-50 border-blue-300"
              }`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${speakerColor(currentSeg.speaker, cfg.isDark)}`}>
                    {currentSeg.speaker === "host" ? cfg.hostLabel
                      : currentSeg.speaker === "guest" ? cfg.guestLabel : "NARRATOR"}
                  </span>
                  <span className={`text-[9px] ${mutedText}`}>{SEGMENT_LABELS[currentSeg.type]}</span>
                  {mode === "exam_cram" && (currentSeg.type === "right_panel_note" || currentSeg.type === "highlight_evidence") && (
                    <span className="ml-auto px-1.5 py-0.5 rounded text-[8px] font-black bg-red-600 text-white tracking-widest">HIGH YIELD</span>
                  )}
                </div>
                <p className={`text-[12px] leading-relaxed ${bodyText}`}>{currentSeg.text}</p>
              </div>
            )}

            {/* Segment list */}
            <div className="px-3 py-2 space-y-1.5">
              {script.segments.map((seg, idx) => {
                const isActive       = playState === "playing" && idx === segIdx;
                const isHighYield    = mode === "exam_cram" && (seg.type === "right_panel_note" || seg.type === "highlight_evidence");
                const isDebateAnchor = mode === "debate" && !!seg.anchorId && isActive;
                return (
                  <button
                    key={seg.id}
                    onClick={() => handleSegmentClick(idx)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                      isActive
                        ? cfg.isDark ? "bg-blue-900/40 border-blue-500/50 shadow-sm" : "bg-blue-100 border-blue-400"
                        : cfg.isDark ? "bg-white/4 border-white/8 hover:bg-white/8" : "bg-white/60 border-slate-200 hover:bg-white/90"
                    } ${SEGMENT_COLORS[seg.type]} ${isDebateAnchor ? "ring-2 ring-green-500/60" : ""}`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[9px] font-bold uppercase tracking-widest ${speakerColor(seg.speaker, cfg.isDark)}`}>
                        {seg.speaker === "host" ? cfg.hostLabel
                          : seg.speaker === "guest" ? cfg.guestLabel : "NARRATOR"}
                      </span>
                      <span className={`text-[9px] uppercase tracking-wide ${mutedText}`}>
                        {SEGMENT_LABELS[seg.type]}
                      </span>
                      {isHighYield && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-red-600 text-white tracking-widest">HIGH YIELD</span>
                      )}
                      {seg.anchorId && (
                        <span className="ml-auto text-[9px] text-amber-400/60">⚓ {seg.anchorId}</span>
                      )}
                      {seg.recallCardId && !seg.anchorId && (
                        <span className="ml-auto text-[9px] text-purple-400/60">📋 Quiz</span>
                      )}
                    </div>
                    <p className={`text-[12px] leading-relaxed ${isActive ? bodyText : mutedText} line-clamp-3`}>
                      {seg.text}
                    </p>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Empty state */}
      {!script && !generating && !studyModel && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="text-3xl">🎙️</span>
          <p className={`text-[12px] ${mutedText} leading-relaxed`}>
            Open a page in the Reader to activate PodcastLab. The Right Panel must synthesize first.
          </p>
        </div>
      )}
    </div>
  );
}
