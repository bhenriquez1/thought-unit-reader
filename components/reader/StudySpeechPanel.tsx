// components/reader/StudySpeechPanel.tsx
// Study Speech — reads PageBrain aloud.
// Primary: OpenAI TTS via /api/tts (server-side, key never exposed).
// Fallback: browser speechSynthesis.

"use client";

import React, { useEffect, useRef, useState } from "react";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import {
  buildSpeechScript,
  STUDY_SPEECH_MODES,
  formulaToSpeech,
  type StudySpeechMode,
  type SpeechSegment,
} from "@/lib/speech/studySpeechEngine";

// ── Role colour map ──────────────────────────────────────────────────────────

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

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type OAIVoice = typeof OPENAI_VOICES[number];

// ── Text builder ─────────────────────────────────────────────────────────────

function buildSpeechText(
  segments: SpeechSegment[],
  mode: StudySpeechMode,
  model: CurrentPageStudyModel,
  activePageText: string,
  fromSegIdx?: number,
): string {
  const segs = fromSegIdx !== undefined ? segments.slice(fromSegIdx) : segments;
  let text = segs.map(s => s.text).filter(Boolean).join(". ").trim();

  // Fallback chain: if segment text is too sparse, use activePageText
  if (text.length < 20 && activePageText) {
    text = formulaToSpeech(activePageText.slice(0, 4000));
  }

  return text.slice(0, 4000);
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  studyModel: CurrentPageStudyModel;
  pageNumber: number;
  activePageText?: string;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function StudySpeechPanel({ studyModel, pageNumber, activePageText = "" }: Props) {
  const [open, setOpen]       = useState(false);
  const [mode, setMode]       = useState<StudySpeechMode>("study");
  const [voice, setVoice]     = useState<OAIVoice>("alloy");
  const [speed, setSpeed]     = useState(1.0);
  const [segments, setSegments] = useState<SpeechSegment[]>([]);
  const [segIdx, setSegIdx]   = useState(0);

  type PlayState = "idle" | "loading" | "playing" | "error";
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  // Active audio element ref — so we can stop/pause
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Stop audio only on page navigation — NOT on studyModel/mode changes.
  // Stage 2 synthesis updates studyModel mid-playback; calling stopAudio() there
  // triggers window.speechSynthesis.cancel() and causes "browser speech canceled" errors.
  useEffect(() => {
    setSegIdx(0);
    stopAudio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  // Rebuild segments when model or mode changes — without stopping audio.
  useEffect(() => {
    const next = buildSpeechScript(studyModel, mode);
    setSegments(next);
  }, [studyModel, mode, pageNumber]);

  // ── Audio helpers ──────────────────────────────────────────────────────────

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPlayState("idle");
  }

  useEffect(() => () => stopAudio(), []);

  // ── Browser speech fallback ─────────────────────────────────────────────────

  function playBrowserSpeech(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlayState("error");
      setErrorMsg("Speech not available in this browser.");
      return;
    }
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = speed;
    utt.onstart = () => {
      console.log("[SPEECH_START]", { source: "browser", charCount: text.length });
      setPlayState("playing");
    };
    utt.onend = () => {
      console.log("[SPEECH_END]", { source: "browser" });
      setPlayState("idle");
    };
    utt.onerror = (e) => {
      if (e.error !== "interrupted") {
        console.warn("[SPEECH_ERROR]", { source: "browser", error: e.error });
        setPlayState("error");
        setErrorMsg(`Browser speech error: ${e.error}`);
      }
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  }

  // ── Main play ──────────────────────────────────────────────────────────────

  async function play(fromIdx = 0) {
    console.log("[SPEECH_PLAY_CLICK]", { mode, fromIdx, segmentCount: segments.length, pageNumber });
    stopAudio();
    setErrorMsg(null);

    const speechText = buildSpeechText(segments, mode, studyModel, activePageText, fromIdx);
    if (!speechText.trim()) {
      setErrorMsg("No text to read for this mode.");
      return;
    }

    console.log("[SPEECH_TEXT_READY]", { charCount: speechText.length, mode, preview: speechText.slice(0, 80) });
    setPlayState("loading");

    try {
      console.log("[OPENAI_SPEECH_START]", { charCount: speechText.length, voice });
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ script: speechText, voice, format: "mp3", return: "json" }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`TTS API ${res.status}: ${err.slice(0, 120)}`);
      }

      const data = await res.json();

      // OpenAI returned real audio
      if (data.audioBase64) {
        console.log("[OPENAI_SPEECH_DONE]", { bytes: data.audioBase64.length });
        const bytes = Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0));
        const blob  = new Blob([bytes], { type: data.mimeType || "audio/mpeg" });
        const url   = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        const audio = new Audio(url);
        audio.playbackRate = speed;
        audioRef.current = audio;
        audio.onplay  = () => { console.log("[SPEECH_AUDIO_PLAY]", { mode }); setPlayState("playing"); };
        audio.onended = () => { console.log("[SPEECH_AUDIO_END]", { mode }); setPlayState("idle"); URL.revokeObjectURL(url); blobUrlRef.current = null; };
        audio.onerror = () => { console.warn("[SPEECH_ERROR]", { source: "openai-audio", mode }); setPlayState("error"); setErrorMsg("Audio playback failed."); };
        await audio.play();
        return;
      }

      // Server signalled browser speech fallback
      if (data.useBrowserSpeech) {
        console.log("[OPENAI_SPEECH_DONE]", { useBrowserFallback: true });
        playBrowserSpeech(data.script || speechText);
        return;
      }

      throw new Error("Unexpected TTS API response");

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[OPENAI_SPEECH_ERROR]", { error: message });
      // Fallback to browser speech
      playBrowserSpeech(speechText);
    }
  }

  function pause() {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setPlayState("idle");
    } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.pause();
      setPlayState("idle");
    }
  }

  function stop() {
    stopAudio();
    setSegIdx(0);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const isPlaying  = playState === "playing";
  const isLoading  = playState === "loading";
  const hasContent = segments.length > 0 || activePageText.length > 20;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: 13 }}>🎧</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#94a3b8", textTransform: "uppercase" }}>Study Speech</span>
        {isPlaying && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#a5b4fc", fontWeight: 600 }}>▶ Playing…</span>
        )}
        {isLoading && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#fbbf24", fontWeight: 600 }}>⟳ Loading…</span>
        )}
        <span style={{ marginLeft: (isPlaying || isLoading) ? undefined : "auto", fontSize: 10, color: "#475569" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {STUDY_SPEECH_MODES.map(m => (
              <button key={m.id} type="button" onClick={() => { setMode(m.id); stop(); }} title={m.description}
                style={{ flex: 1, padding: "4px 0", borderRadius: 6, border: mode === m.id ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.07)", background: mode === m.id ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)", color: mode === m.id ? "#a5b4fc" : "#64748b", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
              >{m.label}</button>
            ))}
          </div>

          {/* Controls row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!isPlaying && !isLoading ? (
              <button type="button" disabled={!hasContent} onClick={() => play(segIdx)}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.4)", background: hasContent ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)", color: hasContent ? "#a5b4fc" : "#475569", fontSize: 12, fontWeight: 700, cursor: hasContent ? "pointer" : "not-allowed" }}
              >▶ Play</button>
            ) : isLoading ? (
              <button type="button" onClick={stop}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)", color: "#fbbf24", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >⟳ Loading…</button>
            ) : (
              <button type="button" onClick={pause}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)", color: "#fbbf24", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >⏸ Pause</button>
            )}
            <button type="button" onClick={stop}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >■ Stop</button>

            {/* Speed */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}>
              <span style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap" }}>{speed.toFixed(1)}×</span>
              <input type="range" min={0.5} max={2.5} step={0.1} value={speed}
                onChange={e => { const v = Number(e.target.value); setSpeed(v); if (audioRef.current) audioRef.current.playbackRate = v; }}
                style={{ width: 60, accentColor: "#818cf8" }} title="Playback speed" />
            </div>
          </div>

          {/* Voice selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#475569", flexShrink: 0 }}>Voice:</span>
            <select value={voice} onChange={e => setVoice(e.target.value as OAIVoice)}
              style={{ flex: 1, fontSize: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#94a3b8", padding: "3px 6px", cursor: "pointer" }}
            >
              {OPENAI_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Error */}
          {errorMsg && (
            <p style={{ fontSize: 11, color: "#fca5a5", margin: 0 }}>⚠ {errorMsg}</p>
          )}

          {/* Segment list */}
          {segments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 200, overflowY: "auto" }}>
              {segments.map((seg, i) => {
                const s = roleStyle(seg.role);
                const isActive = i === segIdx;
                return (
                  <button key={seg.id} type="button"
                    onClick={() => { setSegIdx(i); stop(); setTimeout(() => play(i), 80); }}
                    style={{ display: "flex", alignItems: "flex-start", gap: 7, textAlign: "left", background: isActive ? s.bg : "transparent", border: isActive ? `1px solid ${s.border}` : "1px solid transparent", borderRadius: 7, padding: "4px 7px", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", color: s.text, textTransform: "uppercase", paddingTop: 1, flexShrink: 0, minWidth: 52 }}>
                      {isActive && isPlaying ? "▶ " : ""}{seg.label}
                    </span>
                    <span style={{ fontSize: 11, color: isActive ? "#e2e8f0" : "#64748b", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                      {seg.rawText}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {segments.length === 0 && activePageText.length < 20 && (
            <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>No content available yet — synthesis in progress.</p>
          )}
          {segments.length === 0 && activePageText.length >= 20 && (
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>Reading active page text ({activePageText.length} chars).</p>
          )}
        </div>
      )}
    </div>
  );
}
