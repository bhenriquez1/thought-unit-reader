"use client";
// components/notelab/ChiefResidentVoiceCall.tsx
// CR2 — minimal live-voice-call UI: connect/mute/end, live captions. Owns
// no WebRTC state itself — entirely driven by
// lib/chiefResident/useChiefResidentVoiceSession.ts.

import { useEffect, useRef } from "react";
import { useChiefResidentVoiceSession } from "@/lib/chiefResident/useChiefResidentVoiceSession";
import type { VoiceSessionSourceContext } from "@/lib/chiefResident/chiefResidentVoiceAgent";

interface ChiefResidentVoiceCallProps {
  sourceContext: VoiceSessionSourceContext;
  onExit: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  connected:  "border-emerald-600/40 text-emerald-300 bg-emerald-900/20",
  connecting: "border-amber-600/40 text-amber-300 bg-amber-900/20",
  error:      "border-rose-600/40 text-rose-300 bg-rose-900/20",
  idle:       "border-white/10 text-white/40 bg-white/5",
  ended:      "border-white/10 text-white/40 bg-white/5",
};

export default function ChiefResidentVoiceCall({ sourceContext, onExit }: ChiefResidentVoiceCallProps) {
  const { status, error, transcript, isMuted, connectionStage, connect, disconnect, toggleMute } = useChiefResidentVoiceSession();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    connect(sourceContext);
    return () => disconnect();
    // Intentionally only on mount/unmount — reconnecting on every
    // sourceContext identity change would drop an in-progress call whenever
    // an unrelated re-render produces a new object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  return (
    <div className="flex flex-col h-full bg-[rgb(11,18,34)]">
      <div className="flex-shrink-0 border-b border-white/10 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">🎙️</span>
        <span className="text-[12px] font-semibold text-white/70">Talk Live</span>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] ?? STATUS_STYLES.idle}`}>
            {status}
          </span>
          <button
            onClick={() => { disconnect(); onExit(); }}
            className="px-2.5 py-1 rounded text-[11px] text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
          >
            ← Modes
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-900/20 px-3 py-2 text-[11.5px] text-rose-300">
            {error}
          </div>
        )}
        {transcript.length === 0 && status === "connected" && (
          <p className="text-[11px] text-white/30">Listening — say hello to start.</p>
        )}
        {transcript.length === 0 && status === "connecting" && (
          <p className="text-[11px] text-white/30">
            {connectionStage === "requesting-microphone" ? "Waiting for microphone permission…"
              : connectionStage === "microphone-ready" ? "Preparing the secure voice connection…"
              : connectionStage === "offer-created" ? "Starting the live session…"
              : connectionStage === "upstream-accepted" ? "Connecting audio…"
              : "Connecting…"}
          </p>
        )}
        {transcript.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-xl px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-wrap ${
              turn.role === "user"
                ? "bg-emerald-900/30 text-emerald-100 border border-emerald-700/20"
                : "bg-white/5 text-slate-200 border border-white/8"
            }`}>
              {turn.role === "assistant" && <span className="text-[10px] font-bold text-emerald-400/70 block mb-1.5">🩺 Chief Resident</span>}
              {turn.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 border-t border-white/10 p-3 flex items-center justify-center gap-3">
        <button
          onClick={toggleMute}
          disabled={status !== "connected"}
          className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white/80 transition-colors"
        >
          {isMuted ? "🔇 Unmute" : "🎤 Mute"}
        </button>
        <button
          onClick={() => { disconnect(); onExit(); }}
          className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-rose-700/70 hover:bg-rose-700 text-white transition-colors"
        >
          End Call
        </button>
      </div>
    </div>
  );
}
