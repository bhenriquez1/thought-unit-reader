// components/reader/ChiefResidentModal.tsx
// Unified Chief Resident modal — replaces ExplainItChat + ExplainStepChat.
// Opens as a floating overlay with a pre-selected mode and audience selector.
// Uses the same streaming /api/chief-resident-teaching endpoint as the NoteLab panel.

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { TeachingMode, TeachingAudience } from "@/pages/api/chief-resident-teaching";
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

const SPEECH_OWNER = "chief-resident-modal" as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChiefResidentContext {
  /** Pre-selected teaching mode. */
  mode: "explain-text" | "explain-page";
  /** For explain-text: the highlighted text the student wants explained. */
  selectedText?: string;
  /** Raw page text for context. */
  pageText: string;
  /** AI-derived thesis for this page, if available. */
  pageThesis?: string | null;
  /** Book/document title. */
  documentTitle?: string;
  /** 1-based page number. */
  pageNumber: number;
  /** Learning profile passed from user settings. */
  learningProfile?: string;
}

export interface ChiefResidentMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChiefResidentModalProps {
  context: ChiefResidentContext;
  onClose: () => void;
  onSaveNote?: (question: string, answer: string, turns: ChiefResidentMessage[]) => void | Promise<void>;
  onCreateRecallCard?: (question: string, answer: string, turns: ChiefResidentMessage[]) => void | Promise<void>;
  onAddToStudyGuide?: (question: string, answer: string, turns: ChiefResidentMessage[]) => void | Promise<void>;
  onVisualize?: (payload: { selectedText: string; explanation: string; pageContext: string }) => void;
  /** Resume a prior conversation for this page/selection. */
  initialTurns?: ChiefResidentMessage[];
  onTurnsChange?: (turns: ChiefResidentMessage[]) => void;
}

// ---------------------------------------------------------------------------
// Audience config
// ---------------------------------------------------------------------------

const AUDIENCES: { key: TeachingAudience; label: string; short: string }[] = [
  { key: "dental-student", label: "Dental Student",  short: "D.S." },
  { key: "dat",            label: "DAT Prep",        short: "DAT"  },
  { key: "beginner",       label: "Beginner",        short: "Beg." },
  { key: "dentist",        label: "Dentist",         short: "DDS"  },
  { key: "oral-surgeon",   label: "Oral Surgeon",    short: "OS"   },
  { key: "board-review",   label: "Board Review",    short: "Brd." },
  { key: "child",          label: "Child",           short: "Kid"  },
];

// ---------------------------------------------------------------------------
// Quick-reply chips
// ---------------------------------------------------------------------------

const EXPLAIN_TEXT_CHIPS = [
  { label: "Why?",           prompt: "Why does this work this way?" },
  { label: "Simpler",        prompt: "Explain this simpler." },
  { label: "Example",        prompt: "Give me a concrete example." },
  { label: "Trap",           prompt: "What's the most common mistake students make here?" },
  { label: "Clinical hook",  prompt: "Give me a clinical scenario that makes this stick." },
  { label: "Quiz me",        prompt: "Quiz me on this." },
];

const EXPLAIN_PAGE_CHIPS = [
  { label: "I don't get it",       prompt: "I don't understand this. Can you reframe it?" },
  { label: "Quiz me",              prompt: "Quiz me on this page." },
  { label: "Give an example",      prompt: "Can you give me a concrete example?" },
  { label: "What's the trap?",     prompt: "What's the most common mistake students make on this topic?" },
  { label: "How does it connect?", prompt: "How does this connect to the rest of the chapter?" },
];

// ---------------------------------------------------------------------------
// Streaming fetch
// ---------------------------------------------------------------------------

type ApiError = Error & { code?: string };

function makeApiError(message: string, code?: string): ApiError {
  return Object.assign(new Error(message), { code });
}

async function streamChiefResident(
  body: object,
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/chief-resident-teaching", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as { error?: string; code?: string };
    throw makeApiError(errBody.error || `Chief Resident unavailable (${res.status})`, errBody.code);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return accumulated;
      try {
        const parsed = JSON.parse(data) as { text?: string; error?: string; code?: string };
        if (parsed.error) throw makeApiError(parsed.error, parsed.code);
        if (parsed.text) { accumulated += parsed.text; onToken(parsed.text); }
      } catch (e) {
        if ((e as Error).message !== "Unexpected end of JSON input") throw e;
      }
    }
  }
  return accumulated;
}

// ---------------------------------------------------------------------------
// Build source text for API
// ---------------------------------------------------------------------------

function buildSourceText(ctx: ChiefResidentContext): string {
  const parts: string[] = [];
  if (ctx.pageThesis) parts.push(`Page thesis: ${ctx.pageThesis}`);
  if (ctx.pageText)   parts.push(ctx.pageText.slice(0, 3000));
  return parts.join("\n\n").trim();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ChatTurn = ChiefResidentMessage & { id: string };

export default function ChiefResidentModal({
  context,
  onClose,
  onSaveNote,
  onCreateRecallCard,
  onAddToStudyGuide,
  onVisualize,
  initialTurns,
  onTurnsChange,
}: ChiefResidentModalProps) {
  const [audience, setAudience] = useState<TeachingAudience>("dental-student");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [streamingBuffer, setStreamingBuffer] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [savingAction, setSavingAction] = useState<"note" | "recall" | "studyguide" | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [showAudiencePicker, setShowAudiencePicker] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const globalTokenRef = useRef(0);
  const isStartingRef = useRef(false);
  const initialSentRef = useRef(false);

  const lastAnswer = turns.filter(t => t.role === "assistant").slice(-1)[0]?.content ?? "";
  const lastQuestion = turns.filter(t => t.role === "user").slice(-1)[0]?.content ?? context.selectedText ?? "";

  const quickChips = context.mode === "explain-text" ? EXPLAIN_TEXT_CHIPS : EXPLAIN_PAGE_CHIPS;

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [turns, streamingBuffer]);

  // Expose turn changes
  useEffect(() => {
    if (turns.length === 0) return;
    onTurnsChange?.(turns.map(({ role, content }) => ({ role, content })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      abortRef.current?.abort();
      if (globalTokenRef.current && !isSpeechStale(globalTokenRef.current)) {
        notifySpeechEnd(globalTokenRef.current, SPEECH_OWNER);
      }
    };
  }, []);

  const sendToApi = useCallback(async (history: ChatTurn[], selectedAudience: TeachingAudience) => {
    const sourceText = buildSourceText(context);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsStreaming(true);
    setError(null);
    setErrorCode(null);

    const apiMode: TeachingMode = context.mode === "explain-text" ? "explain-text" : "explain-page";
    const claudeMessages = history.map(({ role, content }) => ({ role, content }));

    try {
      let accumulated = "";
      const body = {
        sourceText,
        bookTitle: context.documentTitle,
        mode: apiMode,
        audience: selectedAudience,
        selectedText: context.selectedText,
        messages: claudeMessages.length === 0
          ? []
          : claudeMessages,
      };
      const full = await streamChiefResident(
        body,
        (token) => { accumulated += token; setStreamingBuffer(accumulated); },
        abortRef.current.signal,
      );
      setTurns(prev => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: full }]);
      setStreamingBuffer("");
    } catch (e) {
      const err = e as ApiError;
      if (err.name !== "AbortError") {
        setError(err.message);
        setErrorCode(err.code ?? null);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [context]);

  // Auto-start on mount
  useEffect(() => {
    if (initialSentRef.current) return;
    initialSentRef.current = true;

    if (initialTurns && initialTurns.length > 0) {
      setTurns(initialTurns.map((t, i) => ({ ...t, id: `restored-${i}` })));
      return;
    }

    // Build the opening user turn
    const firstTurn: ChatTurn = {
      id: "u-0",
      role: "user",
      content: context.mode === "explain-text" && context.selectedText
        ? `Explain this: "${context.selectedText.trim().slice(0, 300)}"`
        : `Let's discuss page ${context.pageNumber}.`,
    };
    setTurns([firstTurn]);
    sendToApi([firstTurn], audience);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isStreaming) return;
    setInput("");
    const userTurn: ChatTurn = { id: `u-${Date.now()}`, role: "user", content };
    const next = [...turns, userTurn];
    setTurns(next);
    await sendToApi(next, audience);
  };

  const handleAudienceChange = (newAudience: TeachingAudience) => {
    setAudience(newAudience);
    setShowAudiencePicker(false);
  };

  const handleSpeakAnswer = async () => {
    if (speaking) {
      stopAllSpeech("cr-modal-stop-button");
      audioRef.current = null;
      setSpeaking(false);
      return;
    }
    if (!lastAnswer || isStartingRef.current) {
      if (isStartingRef.current) logBlockedDuplicate(SPEECH_OWNER);
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
        const blobUrl = URL.createObjectURL(new Blob([arr], { type: data.mimeType || "audio/mpeg" }));
        const audio = new Audio(blobUrl);
        audioRef.current = audio;
        registerActiveAudio(token, audio, () => { audio.pause(); URL.revokeObjectURL(blobUrl); setSpeaking(false); });
        audio.onplay = () => notifySpeechStart(token, SPEECH_OWNER);
        audio.onended = () => { URL.revokeObjectURL(blobUrl); notifySpeechEnd(token, SPEECH_OWNER); setSpeaking(false); };
        audio.onerror = () => { URL.revokeObjectURL(blobUrl); notifySpeechError(token, SPEECH_OWNER, "audio-playback-failed"); setSpeaking(false); };
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

  const runSave = async (kind: "note" | "recall" | "studyguide") => {
    if (!lastAnswer || savingAction) return;
    setShowSaveMenu(false);
    setSavingAction(kind);
    try {
      const plainTurns = turns.map(({ role, content }) => ({ role, content }));
      if (kind === "note") await onSaveNote?.(lastQuestion, lastAnswer, plainTurns);
      else if (kind === "recall") await onCreateRecallCard?.(lastQuestion, lastAnswer, plainTurns);
      else await onAddToStudyGuide?.(lastQuestion, lastAnswer, plainTurns);
    } finally {
      setSavingAction(null);
    }
  };

  const selectedAudienceMeta = AUDIENCES.find(a => a.key === audience);
  const modeLabel = context.mode === "explain-text" ? "Explain This" : "Explain Page";
  const modeIcon = context.mode === "explain-text" ? "💬" : "🎓";

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.80)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 350, damping: 28, mass: 0.8 }}
        className="relative bg-[#0b1222] text-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700/60"
        style={{ width: "min(94vw, 760px)", height: "min(88vh, 720px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-700/60 shrink-0">
          <span className="text-base">{modeIcon}</span>
          <span className="text-[12.5px] font-bold text-white/85 tracking-wide">🩺 Chief Resident</span>
          <span className="text-[11px] text-white/35 font-medium">— {modeLabel}</span>
          <div className="ml-auto flex items-center gap-2">
            {/* Audience pill */}
            <div className="relative">
              <button
                onClick={() => setShowAudiencePicker(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border border-emerald-600/30 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/35 transition-colors"
              >
                <span className="text-[10px]">👤</span>
                {selectedAudienceMeta?.label}
                <span className="text-[9px] text-emerald-400/60">▼</span>
              </button>
              {showAudiencePicker && (
                <div className="absolute right-0 top-full mt-1 z-10 w-40 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
                  {AUDIENCES.map(a => (
                    <button
                      key={a.key}
                      onClick={() => handleAudienceChange(a.key)}
                      className={`w-full text-left px-3 py-2 text-[11px] hover:bg-white/10 transition-colors ${
                        a.key === audience ? "text-emerald-300 font-semibold" : "text-white/60"
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-700/60 text-lg leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Context preview */}
        {(context.selectedText || context.pageThesis) && (
          <div className="px-5 py-2 border-b border-gray-700/50 shrink-0">
            <div className="text-[10px] text-white/30 uppercase tracking-wide mb-0.5">
              {context.selectedText ? "Explaining" : "Discussing"}
            </div>
            <div className="text-[12px] text-white/65 line-clamp-2 leading-snug">
              {context.selectedText
                ? `"${context.selectedText.trim().slice(0, 220)}"`
                : context.pageThesis || `Page ${context.pageNumber}`}
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
          {turns.filter(t => t.id !== "u-0").map(t => (
            <div key={t.id} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[90%] rounded-xl px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                t.role === "user"
                  ? "bg-blue-600/25 border border-blue-500/30 text-blue-50"
                  : "bg-white/5 border border-white/8 text-slate-200"
              }`}>
                {t.role === "assistant" && (
                  <span className="text-[10px] font-bold text-emerald-400/70 block mb-1.5">🩺 Chief Resident</span>
                )}
                {t.content}
              </div>
            </div>
          ))}

          {/* Streaming indicator */}
          {isStreaming && streamingBuffer && (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-xl px-4 py-3 text-[12.5px] bg-white/5 border border-white/8 text-slate-200 whitespace-pre-wrap">
                <span className="text-[10px] font-bold text-emerald-400/70 block mb-1.5">🩺 Chief Resident</span>
                {streamingBuffer}
                <span className="animate-pulse ml-0.5 text-emerald-400">▌</span>
              </div>
            </div>
          )}
          {isStreaming && !streamingBuffer && (
            <div className="flex justify-start">
              <div className="rounded-xl px-4 py-3 bg-white/5 border border-white/8">
                <span className="text-[10px] font-bold text-emerald-400/70 block mb-1.5">🩺 Chief Resident</span>
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-emerald-400/50 rounded-full animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                </span>
              </div>
            </div>
          )}

          {error && (() => {
            const isConfig = errorCode === "missing_configuration";
            const isAuth   = errorCode === "invalid_api_key";
            const permanent = isConfig || isAuth;
            return (
              <div className={`rounded-lg border px-3 py-2.5 text-[11.5px] ${
                permanent
                  ? "border-amber-500/30 bg-amber-900/20 text-amber-200"
                  : "border-rose-500/30 bg-rose-900/20 text-rose-300"
              }`}>
                {isConfig && (
                  <div className="mb-2 space-y-0.5 font-mono text-[10.5px]">
                    <div className="font-semibold text-amber-300 mb-1">⚙️ Chief Resident Status</div>
                    <div>✓ API route reachable</div>
                    <div>✗ Anthropic API key not detected</div>
                    <div>✗ Model unavailable</div>
                    <div>✗ Streaming unavailable</div>
                    <div className="mt-1 text-amber-400/70">Status: Missing server configuration</div>
                  </div>
                )}
                <span>{error}</span>
                {!permanent && (
                  <button
                    onClick={() => { setError(null); setErrorCode(null); sendToApi(turns, audience); }}
                    className="ml-3 underline text-rose-200 hover:text-white"
                  >
                    Retry
                  </button>
                )}
              </div>
            );
          })()}

          <div className="h-1" />
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700/60 px-4 py-3 space-y-2 shrink-0">
          {/* Quick chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {quickChips.map(chip => (
              <button
                key={chip.label}
                onClick={() => handleSend(chip.prompt)}
                disabled={isStreaming}
                className="text-[11px] px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors disabled:opacity-40"
              >
                {chip.label}
              </button>
            ))}

            <div className="ml-auto flex items-center gap-1.5">
              {/* Speak */}
              <button
                onClick={handleSpeakAnswer}
                disabled={!lastAnswer}
                className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-600/25 border border-emerald-500/40 hover:bg-emerald-600/35 transition-colors disabled:opacity-40"
              >
                {speaking ? "⏹ Stop" : "🔊"}
              </button>

              {/* Visualize */}
              {onVisualize && (
                <button
                  onClick={() => onVisualize({
                    selectedText: context.selectedText ?? "",
                    explanation: lastAnswer,
                    pageContext: context.pageText,
                  })}
                  disabled={!lastAnswer}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-amber-600/25 border border-amber-500/40 hover:bg-amber-600/35 transition-colors disabled:opacity-40"
                  title="Draw this on the Whiteboard"
                >
                  🎨
                </button>
              )}

              {/* Save menu */}
              {(onSaveNote || onCreateRecallCard || onAddToStudyGuide) && (
                <div className="relative">
                  <button
                    onClick={() => setShowSaveMenu(v => !v)}
                    disabled={!lastAnswer || savingAction !== null}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-600/25 border border-indigo-500/40 hover:bg-indigo-600/35 transition-colors disabled:opacity-40 flex items-center gap-1"
                  >
                    {savingAction ? "Saving…" : "Save"} <span className="text-[9px]">▼</span>
                  </button>
                  {showSaveMenu && (
                    <div className="absolute bottom-full right-0 mb-1 w-48 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden text-xs z-10">
                      {onSaveNote && (
                        <button onClick={() => runSave("note")} className="w-full text-left px-3 py-2.5 hover:bg-gray-700 transition-colors">
                          📝 Save to NoteLab
                        </button>
                      )}
                      {onCreateRecallCard && (
                        <button onClick={() => runSave("recall")} className="w-full text-left px-3 py-2.5 hover:bg-gray-700 transition-colors">
                          🎯 Create Recall Card
                        </button>
                      )}
                      {onAddToStudyGuide && (
                        <button onClick={() => runSave("studyguide")} className="w-full text-left px-3 py-2.5 hover:bg-gray-700 transition-colors">
                          📚 Add to Study Guide
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Input row */}
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={isStreaming ? "Chief Resident is thinking…" : "Ask a follow-up…"}
              disabled={isStreaming}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[12.5px] text-white/85 placeholder:text-white/25 focus:outline-none focus:border-emerald-600/50 disabled:opacity-40"
            />
            <button
              onClick={() => handleSend()}
              disabled={isStreaming || !input.trim()}
              className="h-9 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 text-white text-[12px] font-semibold transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
