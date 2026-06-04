// components/reader/StudySpeechPanel.tsx
// Compact Study Speech panel — reads the PageBrain (CurrentPageStudyModel) aloud.
// Uses the browser WebSpeech API; no API key required.
// Segment-by-segment playback matching the finalStudyModel structure.

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import {
  buildSpeechScript,
  STUDY_SPEECH_MODES,
  type StudySpeechMode,
  type SpeechSegment,
} from "@/lib/speech/studySpeechEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Role colour map — segment label chips
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, { border: string; text: string; bg: string }> = {
  thesis:          { border: "rgba(251,191,36,0.35)",  text: "#fbbf24", bg: "rgba(251,191,36,0.07)" },
  whyThisMatters:  { border: "rgba(52,211,153,0.30)",  text: "#34d399", bg: "rgba(52,211,153,0.05)" },
  keyMechanism:    { border: "rgba(99,102,241,0.35)",  text: "#818cf8", bg: "rgba(99,102,241,0.07)" },
  commonConfusion: { border: "rgba(239,68,68,0.35)",   text: "#fca5a5", bg: "rgba(239,68,68,0.07)"  },
  examSignal:      { border: "rgba(251,146,60,0.35)",  text: "#fb923c", bg: "rgba(251,146,60,0.07)" },
  conceptBlock:    { border: "rgba(147,197,253,0.30)", text: "#93c5fd", bg: "rgba(147,197,253,0.05)"},
  visualAnchor:    { border: "rgba(167,243,208,0.30)", text: "#6ee7b7", bg: "rgba(167,243,208,0.05)"},
  reasoningFlow:   { border: "rgba(216,180,254,0.30)", text: "#d8b4fe", bg: "rgba(216,180,254,0.05)"},
};

function roleStyle(role: string) {
  return ROLE_COLOR[role] ?? { border: "rgba(255,255,255,0.12)", text: "#94a3b8", bg: "rgba(255,255,255,0.04)" };
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSpeech availability check (SSR-safe)
// ─────────────────────────────────────────────────────────────────────────────

function isSpeechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// ─────────────────────────────────────────────────────────────────────────────
// StudySpeechPanel
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  studyModel: CurrentPageStudyModel;
  pageNumber: number;
}

export default function StudySpeechPanel({ studyModel, pageNumber }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<StudySpeechMode>("study");
  const [speed, setSpeed] = useState(1.0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceIdx, setVoiceIdx] = useState(0);

  // Playback state
  const [playing, setPlaying]     = useState(false);
  const [segIdx, setSegIdx]       = useState(0);
  const [segments, setSegments]   = useState<SpeechSegment[]>([]);

  // Stable refs to avoid stale closures in callbacks
  const playingRef   = useRef(playing);
  const segIdxRef    = useRef(segIdx);
  const speedRef     = useRef(speed);
  const voiceIdxRef  = useRef(voiceIdx);
  const segmentsRef  = useRef(segments);
  const cancelledRef = useRef(false);

  useEffect(() => { playingRef.current   = playing;   }, [playing]);
  useEffect(() => { segIdxRef.current    = segIdx;    }, [segIdx]);
  useEffect(() => { speedRef.current     = speed;     }, [speed]);
  useEffect(() => { voiceIdxRef.current  = voiceIdx;  }, [voiceIdx]);
  useEffect(() => { segmentsRef.current  = segments;  }, [segments]);

  // Rebuild segments whenever model, mode, or page changes
  useEffect(() => {
    const next = buildSpeechScript(studyModel, mode);
    setSegments(next);
    segmentsRef.current = next;
    // If currently playing, stop and reset
    if (playing) stopAll();
    setSegIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyModel, mode, pageNumber]);

  // Load voices (WebSpeech voices load async on first call)
  useEffect(() => {
    if (!isSpeechAvailable()) return;
    const load = () => {
      const available = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
      if (available.length > 0) setVoices(available);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // ── Playback engine ────────────────────────────────────────────────────────

  function stopAll() {
    cancelledRef.current = true;
    if (isSpeechAvailable()) window.speechSynthesis.cancel();
    setPlaying(false);
  }

  const speakSegment = useCallback((idx: number): void => {
    const segs = segmentsRef.current;
    if (cancelledRef.current || idx >= segs.length) {
      setPlaying(false);
      setSegIdx(0);
      return;
    }

    const seg = segs[idx];
    setSegIdx(idx);

    const utt = new SpeechSynthesisUtterance(seg.text);
    utt.rate   = Math.max(0.5, Math.min(3.0, speedRef.current * seg.rateModifier));
    utt.pitch  = seg.role === "commonConfusion" ? 0.85
               : seg.role === "examSignal"      ? 0.90
               : 1.0;
    utt.volume = 1.0;

    const available = voicesRef.current;
    if (available.length > 0) {
      utt.voice = available[voiceIdxRef.current % available.length] ?? null;
    }

    utt.onend = () => {
      if (cancelledRef.current) return;
      const next = idx + 1;
      if (next < segmentsRef.current.length) {
        // Short gap between segments for natural pacing
        setTimeout(() => speakSegment(next), 180);
      } else {
        setPlaying(false);
        setSegIdx(0);
      }
    };

    utt.onerror = (ev) => {
      if (ev.error !== "interrupted") {
        console.warn("[SPEECH_ERROR]", ev.error);
        setPlaying(false);
      }
    };

    window.speechSynthesis.speak(utt);
  }, []);

  // Keep a stable ref to speakSegment
  const speakRef = useRef(speakSegment);
  useEffect(() => { speakRef.current = speakSegment; }, [speakSegment]);

  // Keep voices ref for the utt.voice assignment inside speakSegment
  const voicesRef = useRef(voices);
  useEffect(() => { voicesRef.current = voices; }, [voices]);

  function play(fromIdx?: number) {
    if (!isSpeechAvailable() || segments.length === 0) return;
    cancelledRef.current = false;
    window.speechSynthesis.cancel();
    setPlaying(true);
    const start = fromIdx ?? segIdx;
    speakRef.current(start);
  }

  function pause() {
    if (!isSpeechAvailable()) return;
    if (playing) {
      window.speechSynthesis.pause();
      setPlaying(false);
    }
  }

  function resume() {
    if (!isSpeechAvailable()) return;
    if (!playing) {
      window.speechSynthesis.resume();
      setPlaying(true);
    }
  }

  function stop() {
    stopAll();
    setSegIdx(0);
  }

  // Stop on unmount
  useEffect(() => () => stopAll(), []);

  // ── Derived ────────────────────────────────────────────────────────────────

  const currentSeg  = segments[segIdx] ?? null;
  const hasSpeech   = isSpeechAvailable();
  const hasContent  = segments.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.02)",
        overflow: "hidden",
      }}
    >
      {/* ── Header row ── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13 }}>🎧</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#94a3b8", textTransform: "uppercase" }}>
          Study Speech
        </span>
        {playing && currentSeg && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              color: roleStyle(currentSeg.role).text,
              fontWeight: 600,
              opacity: 0.85,
            }}
          >
            ▶ {currentSeg.label}
          </span>
        )}
        <span style={{ marginLeft: playing ? undefined : "auto", fontSize: 10, color: "#475569" }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>

          {!hasSpeech && (
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>
              Web Speech is not available in this browser.
            </p>
          )}

          {hasSpeech && (
            <>
              {/* Mode tabs */}
              <div style={{ display: "flex", gap: 4 }}>
                {STUDY_SPEECH_MODES.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setMode(m.id); stop(); }}
                    title={m.description}
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      borderRadius: 6,
                      border: mode === m.id
                        ? "1px solid rgba(99,102,241,0.5)"
                        : "1px solid rgba(255,255,255,0.07)",
                      background: mode === m.id
                        ? "rgba(99,102,241,0.12)"
                        : "rgba(255,255,255,0.03)",
                      color: mode === m.id ? "#a5b4fc" : "#64748b",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Playback controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {!playing ? (
                  <button
                    type="button"
                    disabled={!hasContent}
                    onClick={() => play()}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: "1px solid rgba(99,102,241,0.4)",
                      background: hasContent ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)",
                      color: hasContent ? "#a5b4fc" : "#475569",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: hasContent ? "pointer" : "not-allowed",
                    }}
                  >
                    ▶ Play
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={pause}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: "1px solid rgba(251,191,36,0.4)",
                      background: "rgba(251,191,36,0.08)",
                      color: "#fbbf24",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ⏸ Pause
                  </button>
                )}

                {!playing && segIdx > 0 && (
                  <button
                    type="button"
                    onClick={resume}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(52,211,153,0.3)",
                      background: "rgba(52,211,153,0.06)",
                      color: "#34d399",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ▶ Resume
                  </button>
                )}

                <button
                  type="button"
                  onClick={stop}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                    color: "#64748b",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ■ Stop
                </button>

                {/* Speed control */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}>
                  <span style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap" }}>
                    {speed.toFixed(1)}×
                  </span>
                  <input
                    type="range"
                    min={0.5}
                    max={2.5}
                    step={0.1}
                    value={speed}
                    onChange={e => setSpeed(Number(e.target.value))}
                    style={{ width: 60, accentColor: "#818cf8" }}
                    title="Playback speed"
                  />
                </div>
              </div>

              {/* Voice selector (only if multiple voices available) */}
              {voices.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "#475569", flexShrink: 0 }}>Voice:</span>
                  <select
                    value={voiceIdx}
                    onChange={e => setVoiceIdx(Number(e.target.value))}
                    style={{
                      flex: 1,
                      fontSize: 10,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 6,
                      color: "#94a3b8",
                      padding: "3px 6px",
                      cursor: "pointer",
                    }}
                  >
                    {voices.map((v, i) => (
                      <option key={v.voiceURI} value={i}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Segment list — clickable to jump */}
              {segments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 200, overflowY: "auto" }}>
                  {segments.map((seg, i) => {
                    const s   = roleStyle(seg.role);
                    const isActive = i === segIdx;
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => { stop(); setTimeout(() => play(i), 80); }}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 7,
                          textAlign: "left",
                          background: isActive ? s.bg : "transparent",
                          border: isActive
                            ? `1px solid ${s.border}`
                            : "1px solid transparent",
                          borderRadius: 7,
                          padding: "4px 7px",
                          cursor: "pointer",
                          transition: "all 0.12s",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            color: s.text,
                            textTransform: "uppercase",
                            paddingTop: 1,
                            flexShrink: 0,
                            minWidth: 52,
                          }}
                        >
                          {isActive && playing ? "▶ " : ""}{seg.label}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: isActive ? "#e2e8f0" : "#64748b",
                            lineHeight: 1.4,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical" as const,
                          }}
                        >
                          {seg.rawText}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {segments.length === 0 && (
                <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>
                  No content available for this mode on the current page.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
