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
  /** Called when a speech segment with evidenceRefId starts playing — drives PDF focus */
  onEvidenceFocus?: (id: string | null) => void;
  /** Called in Full Page mode with the current sentence text — drives focusSnippet scroll */
  onSnippetFocus?: (snippet: string | null) => void;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function StudySpeechPanel({ studyModel, pageNumber, activePageText = "", onEvidenceFocus, onSnippetFocus }: Props) {
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
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  // Tracks which provider is currently playing — suppresses false browser errors
  const providerRef = useRef<"openai" | "browser" | null>(null);
  // Abort flag for sequential highlights playback
  const abortRef   = useRef(false);

  // Stop audio only on page navigation — NOT on studyModel/mode changes.
  useEffect(() => {
    setSegIdx(0);
    stopAudio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  // Full Page mode: sentence count for progress display
  const [fpSentences, setFpSentences] = useState<string[]>([]);
  useEffect(() => {
    if (mode === "fullPage" && activePageText) {
      // Two-pass split:
      // 1. Split on sentence-ending punctuation followed by whitespace.
      // 2. Merge continuations that start with lowercase (e.g. after abbreviations
      //    like "Fig.", "No.", "e.g.") so medical/chemistry text is not over-split.
      const ABBREV_RE = /\b(Fig|No|vol|pp|cf|e\.g|i\.e|vs|Dr|Mr|Ms|Prof|et\s+al|etc|approx|dept|dept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.\s*$/i;
      const raw = activePageText.split(/(?<=[.!?…])\s+/);
      const merged: string[] = [];
      for (const chunk of raw) {
        const t = chunk.trim();
        if (!t) continue;
        if (
          merged.length > 0 &&
          /^[a-z"'(0-9]/.test(t) &&
          !ABBREV_RE.test(merged[merged.length - 1])
        ) {
          merged[merged.length - 1] += " " + t;
        } else {
          merged.push(t);
        }
      }
      setFpSentences(merged.filter((s) => s.length >= 20));
    } else {
      setFpSentences([]);
    }
  }, [mode, activePageText]);

  // Rebuild segments when model or mode changes — without stopping audio.
  useEffect(() => {
    if (mode === "fullPage") {
      setSegments([]); // fullPage reads sentences directly, no pre-built segments
      return;
    }
    const next = buildSpeechScript(studyModel, mode);
    setSegments(next);
  }, [studyModel, mode, pageNumber]);

  // ── Audio helpers ──────────────────────────────────────────────────────────

  function stopAudio() {
    abortRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    // Only cancel browser synthesis if it was the active provider
    if (providerRef.current === "browser" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    providerRef.current = null;
    setPlayState("idle");
  }

  useEffect(() => () => stopAudio(), []);

  // ── TTS fetch helper — returns Promise<"done" | "browser"> ─────────────────

  async function fetchAndPlayAudio(text: string): Promise<"done" | "browser"> {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ script: text, voice, format: "mp3", return: "json" }),
    });
    if (!res.ok) throw new Error(`TTS API ${res.status}`);
    const data = await res.json();

    if (data.audioBase64) {
      console.log("[OPENAI_SPEECH_DONE]", { provider: data.provider ?? "openai", bytes: data.audioBase64.length });
      const bytes = Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0));
      const blob  = new Blob([bytes], { type: data.mimeType || "audio/mpeg" });
      const url   = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const audio = new Audio(url);
      audio.playbackRate = speed;
      audioRef.current   = audio;
      providerRef.current = "openai";
      return new Promise((resolve, reject) => {
        audio.onplay  = () => { console.log("[SPEECH_AUDIO_PLAY]", { mode }); setPlayState("playing"); };
        audio.onended = () => { console.log("[SPEECH_AUDIO_END]", { mode }); URL.revokeObjectURL(url); blobUrlRef.current = null; resolve("done"); };
        audio.onerror = () => {
          // stopAudio() clears src which fires onerror — treat as clean stop, not failure
          if (abortRef.current) { resolve("done"); return; }
          console.warn("[SPEECH_ERROR]", { source: "openai-audio", mode });
          reject(new Error("Audio playback failed"));
        };
        audio.play().catch((e) => { if (abortRef.current) resolve("done"); else reject(e); });
      });
    }

    if (data.useBrowserSpeech) {
      console.log("[SPEECH_FALLBACK_USED]", { provider: "browser", reason: data.fallbackReason ?? "openai-unavailable" });
      return "browser";
    }

    throw new Error("Unexpected TTS response");
  }

  // ── Browser speech fallback ─────────────────────────────────────────────────

  function playBrowserSpeech(text: string, onDone?: () => void) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPlayState("error");
      setErrorMsg("Speech not available in this browser.");
      onDone?.();
      return;
    }
    providerRef.current = "browser";
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate  = speed;
    utt.onstart = () => { console.log("[SPEECH_AUDIO_PLAY]", { source: "browser", charCount: text.length }); setPlayState("playing"); };
    utt.onend   = () => { console.log("[SPEECH_AUDIO_END]", { source: "browser" }); setPlayState("idle"); onDone?.(); };
    utt.onerror = (e) => {
      // "canceled" fires when speechSynthesis.cancel() is called intentionally — not an error
      if (e.error === "canceled" || e.error === "interrupted") return;
      if (providerRef.current !== "browser") return; // OpenAI took over
      console.warn("[SPEECH_ERROR]", { source: "browser", error: e.error });
      setPlayState("error");
      setErrorMsg(`Speech error: ${e.error}`);
      onDone?.();
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  }

  // ── Full Page: sentence-by-sentence playback ──────────────────────────────

  async function playFullPageSequential(sentences: string[], fromIdx: number) {
    abortRef.current = false;
    setPlayState("loading");

    for (let i = fromIdx; i < sentences.length; i++) {
      if (abortRef.current) break;
      const raw = sentences[i];
      const text = formulaToSpeech(raw).slice(0, 500);
      setSegIdx(i);

      console.log("[SPEECH_SEGMENT_START]", { segIdx: i, role: "fullPage", charCount: text.length, totalSentences: sentences.length });
      onSnippetFocus?.(raw);

      try {
        const result = await fetchAndPlayAudio(text);
        if (abortRef.current) break;
        if (result === "browser") {
          await new Promise<void>((resolve) => playBrowserSpeech(text, resolve));
        }
        if (!abortRef.current && i < sentences.length - 1) {
          await new Promise((r) => setTimeout(r, 150));
        }
      } catch (err: unknown) {
        if (abortRef.current) break;
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[OPENAI_SPEECH_ERROR]", { error: message, segIdx: i, mode: "fullPage" });
        await new Promise<void>((resolve) => playBrowserSpeech(text, resolve));
      }
    }

    if (!abortRef.current) {
      setPlayState("idle");
      onSnippetFocus?.(null);
    }
  }

  // ── Per-segment sequential playback (highlights mode) ─────────────────────

  async function playHighlightsSequential(segs: SpeechSegment[], fromIdx: number) {
    abortRef.current = false;
    setPlayState("loading");

    for (let i = fromIdx; i < segs.length; i++) {
      if (abortRef.current) break;
      const seg = segs[i];
      setSegIdx(i);

      console.log("[SPEECH_SEGMENT_START]", { segIdx: i, id: seg.id, evidenceRefId: seg.evidenceRefId, charCount: seg.text.length, role: seg.role });
      if (seg.evidenceRefId) {
        console.log("[SPEECH_SEGMENT_FOCUS]", { evidenceRefId: seg.evidenceRefId, segIdx: i, totalSegs: segs.length, source: "speech-highlights-mode" });
        console.log("[LEFT_PANEL_FOCUS_EVIDENCE]", { evidenceRefId: seg.evidenceRefId, segIdx: i, source: "speech-segment" });
        onEvidenceFocus?.(seg.evidenceRefId);
      }

      console.log("[OPENAI_SPEECH_START]", { segIdx: i, charCount: seg.text.length, voice, evidenceRefId: seg.evidenceRefId });
      try {
        const result = await fetchAndPlayAudio(seg.text);
        if (abortRef.current) break; // user stopped during fetch
        if (result === "browser") {
          await new Promise<void>((resolve) => playBrowserSpeech(seg.text, resolve));
        }
        // Small pause between segments
        if (!abortRef.current && i < segs.length - 1) {
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch (err: unknown) {
        if (abortRef.current) break; // user stopped — not an OpenAI failure, no fallback
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[OPENAI_SPEECH_ERROR]", { error: message, segIdx: i });
        console.log("[SPEECH_FALLBACK_USED]", { provider: "browser", reason: "openai-error" });
        await new Promise<void>((resolve) => playBrowserSpeech(seg.text, resolve));
      }
    }

    if (!abortRef.current) {
      setPlayState("idle");
      onEvidenceFocus?.(null);
    }
  }

  // ── Main play ──────────────────────────────────────────────────────────────

  async function play(fromIdx = 0) {
    console.log("[SPEECH_PLAY_CLICK]", { mode, fromIdx, segmentCount: segments.length, pageNumber });
    stopAudio();
    abortRef.current = false;
    setErrorMsg(null);

    // Full Page mode: sentence-by-sentence through activePageText
    if (mode === "fullPage") {
      // Use pre-computed fpSentences (two-pass splitter); fall back to simple split.
      const sents = fpSentences.length > 0 ? fpSentences : (() => {
        const ABBREV_RE = /\b(Fig|No|vol|pp|cf|e\.g|i\.e|vs|Dr|Mr|Ms|Prof|et\s+al|etc)\.\s*$/i;
        const raw = activePageText.split(/(?<=[.!?…])\s+/);
        const merged: string[] = [];
        for (const chunk of raw) {
          const t = chunk.trim();
          if (!t) continue;
          if (merged.length > 0 && /^[a-z"'(0-9]/.test(t) && !ABBREV_RE.test(merged[merged.length - 1])) {
            merged[merged.length - 1] += " " + t;
          } else { merged.push(t); }
        }
        return merged.filter((s) => s.length >= 20);
      })();
      if (!sents.length) { setErrorMsg("No page text available."); return; }
      console.log("[SPEECH_SOURCE]", { mode: "fullPage", source: "activePageText", sentenceCount: sents.length, charCount: activePageText.length });
      playFullPageSequential(sents, fromIdx);
      return;
    }

    // Highlights mode: per-segment sequential playback with PDF focus
    if (mode === "highlights") {
      const segsToPlay = segments.length > 0 ? segments : buildSpeechScript(studyModel, "highlights");
      if (!segsToPlay.length) { setErrorMsg("No highlight anchors to read."); return; }
      console.log("[SPEECH_SOURCE]", { mode: "highlights", source: "finalStudyModel.visualAnchors", itemCount: segsToPlay.length, charCount: segsToPlay.reduce((n, s) => n + s.text.length, 0) });
      console.log("[SPEECH_EYE_GUIDE_SOURCE]", {
        mode: "highlights",
        segmentCount: segsToPlay.length,
        evidenceRefIds: segsToPlay.map((s) => s.evidenceRefId ?? null),
        note: "each evidenceRefId will drive focusedEvidenceId → PDF rect scroll",
      });
      playHighlightsSequential(segsToPlay, fromIdx);
      return;
    }

    // study | full | focus — sequential per-segment, fires onEvidenceFocus per step.
    // This gives the same Left Panel eye guidance as highlights mode.
    const segsToPlay = segments.length > 0 ? segments : buildSpeechScript(studyModel, mode);
    if (!segsToPlay.length) {
      setErrorMsg("No text to read for this mode.");
      return;
    }

    console.log("[SPEECH_SOURCE]", {
      mode,
      source: "finalStudyModel.studyNotes",
      itemCount: segsToPlay.length,
      charCount: segsToPlay.reduce((n, s) => n + s.text.length, 0),
    });

    abortRef.current = false;
    setPlayState("loading");

    for (let i = fromIdx; i < segsToPlay.length; i++) {
      if (abortRef.current) break;
      const seg = segsToPlay[i];
      setSegIdx(i);

      if (seg.evidenceRefId) {
        onEvidenceFocus?.(seg.evidenceRefId);
        console.log("[SPEECH_EYE_FOCUS]", {
          segIdx: i, mode, evidenceRefId: seg.evidenceRefId, role: seg.role,
        });
      }
      console.log("[SPEECH_SEGMENT_START]", {
        segIdx: i, mode, role: seg.role, charCount: seg.text.length,
      });
      console.log("[OPENAI_SPEECH_START]", { segIdx: i, charCount: seg.text.length, voice });

      try {
        const result = await fetchAndPlayAudio(formulaToSpeech(seg.text).slice(0, 500));
        if (abortRef.current) break;
        if (result === "browser") {
          await new Promise<void>((resolve) => playBrowserSpeech(seg.text, resolve));
        }
        if (!abortRef.current && i < segsToPlay.length - 1) {
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch (err: unknown) {
        if (abortRef.current) break;
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[OPENAI_SPEECH_ERROR]", { error: message, segIdx: i, mode });
        console.log("[SPEECH_FALLBACK_USED]", { provider: "browser", reason: "openai-error" });
        await new Promise<void>((resolve) => playBrowserSpeech(seg.text, resolve));
      }
    }

    if (!abortRef.current) {
      setPlayState("idle");
      onEvidenceFocus?.(null);
    }
  }

  function pause() {
    abortRef.current = true;
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setPlayState("idle");
    } else if (providerRef.current === "browser" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.pause();
      setPlayState("idle");
    }
  }

  function stop() {
    console.log("[SPEECH_STOP_USER]", { mode, segIdx, playState });
    stopAudio();
    setSegIdx(0);
    onEvidenceFocus?.(null);
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

          {/* Full Page mode progress */}
          {mode === "fullPage" && fpSentences.length > 0 && (
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>
              {isPlaying || isLoading
                ? `Sentence ${segIdx + 1} of ${fpSentences.length}`
                : `${fpSentences.length} sentences · click ▶ Play to start`}
            </p>
          )}

          {segments.length === 0 && mode !== "fullPage" && activePageText.length < 20 && (
            <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>No content available yet — synthesis in progress.</p>
          )}
          {segments.length === 0 && mode !== "fullPage" && activePageText.length >= 20 && (
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>Reading active page text ({activePageText.length} chars).</p>
          )}
        </div>
      )}
    </div>
  );
}
