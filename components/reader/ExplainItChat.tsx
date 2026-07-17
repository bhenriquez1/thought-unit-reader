// components/reader/ExplainItChat.tsx
// "Explain It" — a centered office-hours-style conversation about the current
// page/topic. Unlike ExplainStepChat (a terse micro-tutor for one selected
// sentence), this is meant to feel like a study partner: it opens with a
// short framing + a discussion question, and keeps going back and forth.
//
// Shares context (page text, active thought unit, RightPanel notes, NoteLab,
// RecallLab, Study Guide Lab, Podcast Lab outline) so it never starts cold,
// and can hand the conversation off to Podcast Lab via "Turn into Podcast".

"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ExplainItMessage } from "@/lib/explainIt/types";
import type { ExplainItContext } from "@/lib/explainIt/types";
import { SpeechRecognitionAPI } from "@/lib/voiceTools";
import {
  claimSpeech,
  isSpeechStale,
  registerActiveAudio,
  registerActiveUtterance,
  notifySpeechStart,
  notifySpeechEnd,
  notifySpeechError,
  logBlockedDuplicate,
  stopAllSpeech,
} from "@/lib/speech/speechController";

const SPEECH_OWNER = "explain-it" as const;

interface ExplainItChatProps {
  context: ExplainItContext;
  onClose: () => void;
  /** Resume a prior conversation for this same page, if one exists. */
  initialTurns?: ExplainItMessage[];
  /** Called whenever the conversation changes, so the host can persist it for this page. */
  onTurnsChange?: (turns: ExplainItMessage[]) => void;
  /** Send the conversation so far to Podcast Lab to seed a new episode. */
  onTurnIntoPodcast?: (transcript: ExplainItMessage[]) => void;
}

type ChatTurn = ExplainItMessage & { id: string };

const QUICK_CHIPS: { label: string; prompt: string }[] = [
  { label: "I don't get it", prompt: "I don't understand this — can you explain it differently?" },
  { label: "Quiz me", prompt: "Quiz me on this with a question." },
  { label: "Give an example", prompt: "Can you give me a concrete example?" },
  { label: "How does this connect?", prompt: "How does this connect to the rest of the chapter?" },
];

export default function ExplainItChat({
  context,
  onClose,
  initialTurns,
  onTurnsChange,
  onTurnIntoPodcast,
}: ExplainItChatProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const globalTokenRef = useRef(0);
  const isStartingRef = useRef(false);

  const lastAnswer = turns.filter((t) => t.role === "assistant").slice(-1)[0]?.content ?? "";

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [turns, loading]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      SpeechRecognitionAPI.stop();
      if (globalTokenRef.current && !isSpeechStale(globalTokenRef.current)) {
        notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
      }
    };
  }, []);

  useEffect(() => {
    if (turns.length === 0) return;
    onTurnsChange?.(turns.map(({ role, content }) => ({ role, content })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns]);

  const sendTurn = async (history: ChatTurn[]) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/explainIt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeThoughtUnitText: context.activeThoughtUnitText,
          pageText: context.pageText,
          pageThesis: context.pageThesis,
          studyNotes: context.studyNotes,
          conceptTitles: context.conceptTitles,
          relatedNotes: context.relatedNotes,
          relatedRecallCards: context.relatedRecallCards,
          studyGuideSections: context.studyGuideSections,
          podcastOutline: context.podcastOutline,
          seedSegmentText: context.seedSegmentText,
          documentTitle: context.documentTitle,
          pageNumber: context.pageNumber,
          learningProfile: context.learningProfile,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.reply) {
        setError(data?.error || "Explain It is unavailable right now.");
        return;
      }
      setTurns((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: data.reply }]);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-open with a single kickoff turn so the tutor frames the page/topic
  // and asks a discussion question, rather than waiting on the student.
  useEffect(() => {
    if (initialSentRef.current) return;
    initialSentRef.current = true;
    if (initialTurns && initialTurns.length > 0) {
      setTurns(initialTurns.map((t, i) => ({ ...t, id: `restored-${i}` })));
      return;
    }
    const firstTurn: ChatTurn = {
      id: "u-0",
      role: "user",
      content: context.seedSegmentText
        ? `Let's talk about this: "${context.seedSegmentText.slice(0, 300)}"`
        : `Let's talk through page ${context.pageNumber}.`,
    };
    setTurns([firstTurn]);
    sendTurn([firstTurn]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    const userTurn: ChatTurn = { id: `u-${Date.now()}`, role: "user", content };
    const next = [...turns, userTurn];
    setTurns(next);
    await sendTurn(next);
  };

  const handleMicToggle = () => {
    if (listening) {
      SpeechRecognitionAPI.stop();
      setListening(false);
      return;
    }
    setListening(true);
    SpeechRecognitionAPI.start({
      interimResults: true,
      onInterim: (text) => setInput(text),
      onResult: (text) => {
        setListening(false);
        setInput("");
        if (text.trim()) handleSend(text);
      },
      onError: () => setListening(false),
    });
  };

  const handleSpeakAnswer = async () => {
    if (speaking) {
      stopAllSpeech("explain-it-stop-button");
      audioRef.current = null;
      setSpeaking(false);
      return;
    }
    if (!lastAnswer) return;
    if (isStartingRef.current) {
      logBlockedDuplicate(SPEECH_OWNER);
      return;
    }
    isStartingRef.current = true;
    const token = claimSpeech(SPEECH_OWNER);
    globalTokenRef.current = token;
    setTimeout(() => { isStartingRef.current = false; }, 400);
    setSpeaking(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: lastAnswer.slice(0, 3000), voice: "alloy", format: "mp3", return: "json" }),
      });
      if (isSpeechStale(token)) { setSpeaking(false); return; }
      const data = await res.json();
      if (isSpeechStale(token)) { setSpeaking(false); return; }
      if (data?.audioBase64 && !data?.useBrowserSpeech) {
        const bin = atob(data.audioBase64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const blob = new Blob([arr], { type: data.mimeType || "audio/mpeg" });
        const audio = new Audio(URL.createObjectURL(blob));
        audioRef.current = audio;
        registerActiveAudio(token, audio, () => {
          audio.pause();
          setSpeaking(false);
        });
        audio.onplay = () => notifySpeechStart(token, SPEECH_OWNER);
        audio.onended = () => { notifySpeechEnd(token, SPEECH_OWNER); setSpeaking(false); };
        audio.onerror = () => { notifySpeechError(token, SPEECH_OWNER, "audio-playback-failed"); setSpeaking(false); };
        await audio.play();
      } else if (data?.useBrowserSpeech && typeof window !== "undefined" && "speechSynthesis" in window) {
        const utter = new SpeechSynthesisUtterance(data.script || lastAnswer);
        registerActiveUtterance(token, utter, () => setSpeaking(false));
        utter.onstart = () => notifySpeechStart(token, SPEECH_OWNER);
        utter.onend = () => { notifySpeechEnd(token, SPEECH_OWNER); setSpeaking(false); };
        utter.onerror = (e) => { notifySpeechError(token, SPEECH_OWNER, e.error); setSpeaking(false); };
        window.speechSynthesis.speak(utter);
      } else {
        notifySpeechEnd(token, SPEECH_OWNER);
        setSpeaking(false);
      }
    } catch {
      notifySpeechError(token, SPEECH_OWNER, "tts-fetch-failed");
      setSpeaking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.78)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 350, damping: 28, mass: 0.8 }}
        className="relative bg-[#0d1424] text-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700/60"
        style={{ width: "min(94vw, 760px)", height: "min(88vh, 720px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/60 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">🎓</span>
            <span className="text-sm font-semibold tracking-wide text-gray-200">Explain It</span>
            <span className="text-[11px] text-gray-500">— page {context.pageNumber}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-700/60 text-lg leading-none"
            aria-label="Close Explain It"
          >
            ✕
          </button>
        </div>

        {/* Topic preview */}
        <div className="px-5 py-2 border-b border-gray-700/60 shrink-0">
          <div className="uppercase tracking-wide text-[10px] text-gray-500 mb-1">
            {context.seedSegmentText ? "Discussing Podcast Moment" : "Discussing"}
          </div>
          <div className="text-sm text-gray-300 line-clamp-2">
            {context.seedSegmentText
              ? `"${context.seedSegmentText.trim().replace(/\s+/g, " ").slice(0, 220)}"`
              : context.pageThesis || `Page ${context.pageNumber}`}
          </div>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
          {turns.filter((t) => t.id !== "u-0").map((t) => (
            <div key={t.id} className={t.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  t.role === "user"
                    ? "max-w-[85%] bg-blue-600/30 border border-blue-500/40 rounded-lg px-3 py-2"
                    : "text-gray-200 leading-relaxed whitespace-pre-wrap"
                }
              >
                {t.content}
              </div>
            </div>
          ))}
          {turns.length === 1 && turns[0]?.id === "u-0" && !loading && (
            <div className="text-gray-400">Getting the conversation going…</div>
          )}
          {loading && <div className="text-gray-400">Thinking…</div>}
          {error && (
            <div className="bg-red-900/40 border border-red-700/60 rounded-lg px-3 py-2 text-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Footer: quick chips, podcast handoff, input */}
        <div className="border-t border-gray-700/60 px-5 py-3 space-y-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.label}
                onClick={() => handleSend(chip.prompt)}
                disabled={loading}
                className="text-xs px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {chip.label}
              </button>
            ))}

            <button
              onClick={handleSpeakAnswer}
              disabled={!lastAnswer}
              className="text-xs px-3 py-1 rounded-full bg-emerald-600/30 border border-emerald-500/50 hover:bg-emerald-600/40 transition-colors disabled:opacity-40 ml-auto"
              title={speaking ? "Stop reading the tutor's answer aloud" : "Read the tutor's answer aloud"}
            >
              {speaking ? "⏹ Stop" : "🔊 Speak Answer"}
            </button>

            {onTurnIntoPodcast && (
              <button
                onClick={() => onTurnIntoPodcast(turns.map(({ role, content }) => ({ role, content })))}
                disabled={turns.length < 2}
                className="text-xs px-3 py-1 rounded-full bg-violet-600/30 border border-violet-500/50 hover:bg-violet-600/40 transition-colors disabled:opacity-40"
                title="Send this conversation to Podcast Lab to generate an episode"
              >
                🎙️ Turn into Podcast
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMicToggle}
              disabled={loading}
              title={listening ? "Stop listening" : "Speak your question"}
              aria-label={listening ? "Stop voice input" : "Start voice input"}
              className={
                listening
                  ? "px-3 py-1.5 rounded-lg border border-red-500/50 bg-red-600/30 text-red-200 text-sm transition-colors animate-pulse"
                  : "px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-sm transition-colors disabled:opacity-50"
              }
            >
              {listening ? "🎙️" : "🎤"}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={listening ? "Listening…" : "Talk it through…"}
              disabled={loading}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
