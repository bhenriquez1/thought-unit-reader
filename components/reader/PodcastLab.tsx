// components/reader/PodcastLab.tsx
// Advanced study discussion panel — aggregates finalStudyModel, visualAnchors,
// NoteLab, RecallLab, and page text into a structured podcast.

import React, { useState, useRef, useCallback, useEffect } from "react";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import type { PodcastMode, PodcastScript, PodcastSegment } from "@/lib/podcast/podcastTypes";
import { PODCAST_MODES, SEGMENT_COLORS, SEGMENT_LABELS } from "@/lib/podcast/podcastTypes";
import { getAllUltraNotes } from "@/lib/notelab/ultraNoteStore";
import { getAllRecallSets } from "@/lib/recalllab/recallStore";
import { formulaToSpeech } from "@/lib/speech/studySpeechEngine";

interface Props {
  studyModel: CurrentPageStudyModel | null;
  pageNumber: number;
  bookId: string;
  activePageText?: string;
  onEvidenceFocus?: (id: string | null) => void;
}

type PlayState = "idle" | "loading" | "playing" | "paused";

const SPEAKER_COLORS: Record<string, string> = {
  host:     "text-blue-300",
  guest:    "text-emerald-300",
  narrator: "text-slate-400",
};
const SPEAKER_LABELS: Record<string, string> = {
  host:     "HOST",
  guest:    "GUEST",
  narrator: "NARRATOR",
};

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

  const abortRef   = useRef(false);
  const audioRef   = useRef<HTMLAudioElement | null>(null);

  // Wipe script when page or mode changes
  useEffect(() => {
    setScript(null);
    setGenError(null);
    setPlayState("idle");
    setSegIdx(0);
    abortRef.current = true;
  }, [pageNumber, bookId, mode]);

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
      page:          pageNumber,
      bookId,
      mode,
      visualAnchors: studyModel.visualAnchors.length,
      noteLab:       noteLab.length,
      recallLab:     recallLab.length,
      pageTextChars: activePageText.length,
    });

    try {
      const res = await fetch("/api/podcast-script", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            pageNumber,
            bookId,
            pageText:   activePageText.slice(0, 800),
            studyModel: {
              pageThesis:   studyModel.pageThesis,
              studyNotes:   studyModel.studyNotes,
              conceptBlocks: studyModel.conceptBlocks.slice(0, 3),
              visualAnchors: studyModel.visualAnchors.slice(0, 6),
            },
            noteLab,
            recallLab,
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
    } catch (err: any) {
      setGenError(err?.message ?? "Failed to generate script");
    } finally {
      setGenerating(false);
    }
  }, [studyModel, pageNumber, bookId, mode, activePageText]);

  // ── TTS playback ───────────────────────────────────────────────────────
  const stop = useCallback(() => {
    abortRef.current = true;
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setPlayState("idle");
    onEvidenceFocus?.(null);
  }, [onEvidenceFocus]);

  const fetchAndPlayAudio = useCallback(async (text: string, voice: string): Promise<void> => {
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
        const bytes  = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
        const blob   = new Blob([bytes], { type: data.mimeType ?? "audio/mpeg" });
        const url    = URL.createObjectURL(blob);
        const audio  = new Audio(url);
        audioRef.current = audio;
        await new Promise<void>((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
          audio.play().catch(() => resolve());
        });
      }
    } catch {
      // silent — continue to next segment
    }
  }, []);

  const playFrom = useCallback(async (startIdx: number) => {
    if (!script) return;
    abortRef.current = false;
    setPlayState("playing");

    const modeInfo = PODCAST_MODES.find((m) => m.id === mode)!;

    for (let i = startIdx; i < script.segments.length; i++) {
      if (abortRef.current) break;
      const seg = script.segments[i];
      setSegIdx(i);

      // Focus left-panel anchor if present
      if (seg.anchorId) {
        onEvidenceFocus?.(seg.anchorId);
        console.log("[PODCAST_SEGMENT_START]", {
          segIdx: i, type: seg.type, speaker: seg.speaker, anchorId: seg.anchorId,
          sourceField: seg.sourceField ?? null, chars: seg.text.length,
        });
      } else {
        console.log("[PODCAST_SEGMENT_START]", {
          segIdx: i, type: seg.type, speaker: seg.speaker, chars: seg.text.length,
        });
      }

      const voice = seg.speaker === "guest" ? modeInfo.guestVoice : modeInfo.hostVoice;
      await fetchAndPlayAudio(formulaToSpeech(seg.text).slice(0, 500), voice);

      if (abortRef.current) break;
    }

    if (!abortRef.current) {
      setPlayState("idle");
      onEvidenceFocus?.(null);
    }
  }, [script, mode, onEvidenceFocus, fetchAndPlayAudio]);

  const handlePlay = useCallback(() => {
    if (playState === "playing") {
      stop();
    } else {
      const fromIdx = playState === "paused" ? segIdx : 0;
      playFrom(fromIdx);
    }
  }, [playState, segIdx, playFrom, stop]);

  const handleSegmentClick = useCallback((idx: number) => {
    stop();
    setTimeout(() => playFrom(idx), 80);
  }, [stop, playFrom]);

  // ── Render ─────────────────────────────────────────────────────────────

  const currentSeg: PodcastSegment | undefined = script?.segments[segIdx];

  return (
    <div className="h-full flex flex-col bg-[#070d17] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎙️</span>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-white/40">PodcastLab</div>
            <div className="text-[13px] font-semibold text-white/90">Advanced Study Discussion</div>
          </div>
        </div>
        {script && (
          <div className="text-[10px] text-white/30">
            ~{script.estimatedMinutes} min · {script.totalSegments} segments
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">Mode</div>
        <div className="flex flex-wrap gap-1.5">
          {PODCAST_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              title={m.description}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                mode === m.id
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90"
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Source info */}
      {studyModel && (
        <div className="px-3 pb-2 shrink-0">
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className="px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300/80 border border-emerald-600/20">
              ✓ Right Panel ({studyModel.visualAnchors.length} anchors)
            </span>
            {(() => {
              const n = getAllUltraNotes().filter((n) => n.bookId === bookId && n.pageNumber === pageNumber).length;
              return n > 0 ? (
                <span className="px-2 py-0.5 rounded bg-green-900/40 text-green-300/80 border border-green-600/20">
                  ✓ NoteLab ({n})
                </span>
              ) : null;
            })()}
            {(() => {
              const n = getAllRecallSets().filter((r) => r.bookId === bookId && r.pageNumber === pageNumber).reduce((s, r) => s + r.cards.length, 0);
              return n > 0 ? (
                <span className="px-2 py-0.5 rounded bg-purple-900/40 text-purple-300/80 border border-purple-600/20">
                  ✓ RecallLab ({n} cards)
                </span>
              ) : null;
            })()}
          </div>
        </div>
      )}

      {/* Generate button */}
      {!script && (
        <div className="px-3 pb-3 shrink-0">
          <button
            onClick={generateScript}
            disabled={!studyModel || generating}
            className="w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow"
          >
            {generating ? "Generating podcast…" : !studyModel ? "Waiting for Right Panel…" : "🎙️ Generate Podcast"}
          </button>
          {genError && (
            <p className="mt-2 text-[11px] text-red-400/80 text-center">{genError}</p>
          )}
        </div>
      )}

      {/* Script segments */}
      {script && (
        <>
          {/* Playback bar */}
          <div className="px-3 py-2 border-t border-b border-white/8 shrink-0 flex items-center gap-3">
            <button
              onClick={handlePlay}
              className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                playState === "playing"
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {playState === "playing" ? "⏹ Stop" : "▶ Play"}
            </button>
            <div className="text-[10px] text-white/40">
              {playState === "playing"
                ? `Playing ${segIdx + 1} / ${script.totalSegments}`
                : `${script.totalSegments} segments · ~${script.estimatedMinutes} min`}
            </div>
            <button
              onClick={() => { setScript(null); setGenError(null); }}
              className="ml-auto text-[10px] text-white/30 hover:text-white/60 transition-colors"
            >
              Regenerate
            </button>
          </div>

          {/* Active segment banner */}
          {playState === "playing" && currentSeg && (
            <div className="mx-3 mt-2 px-3 py-2 rounded-xl bg-blue-900/30 border border-blue-500/30 shrink-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span className={`text-[9px] font-bold uppercase tracking-widest ${SPEAKER_COLORS[currentSeg.speaker]}`}>
                  {SPEAKER_LABELS[currentSeg.speaker]}
                </span>
                <span className="text-[9px] text-white/30">{SEGMENT_LABELS[currentSeg.type]}</span>
              </div>
              <p className="text-[12px] text-white/90 leading-relaxed">{currentSeg.text}</p>
            </div>
          )}

          {/* Segment list */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
            {script.segments.map((seg, idx) => (
              <button
                key={seg.id}
                onClick={() => handleSegmentClick(idx)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                  playState === "playing" && idx === segIdx
                    ? "bg-blue-900/40 border-blue-500/50 shadow-sm"
                    : "bg-white/4 border-white/8 hover:bg-white/8"
                } ${SEGMENT_COLORS[seg.type]}`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${SPEAKER_COLORS[seg.speaker]}`}>
                    {SPEAKER_LABELS[seg.speaker]}
                  </span>
                  <span className="text-[9px] text-white/25 uppercase tracking-wide">
                    {SEGMENT_LABELS[seg.type]}
                  </span>
                  {seg.anchorId && (
                    <span className="ml-auto text-[9px] text-amber-400/60">⚓ {seg.anchorId}</span>
                  )}
                  {seg.recallCardId && (
                    <span className="ml-auto text-[9px] text-purple-400/60">📋 Quiz</span>
                  )}
                </div>
                <p className={`text-[12px] leading-relaxed ${
                  playState === "playing" && idx === segIdx ? "text-white/95" : "text-white/65"
                } line-clamp-3`}>
                  {seg.text}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!script && !generating && !studyModel && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="text-3xl">🎙️</span>
          <p className="text-[12px] text-white/40 leading-relaxed">
            Open a page in the Reader to activate PodcastLab. The Right Panel must synthesize first.
          </p>
        </div>
      )}
    </div>
  );
}
