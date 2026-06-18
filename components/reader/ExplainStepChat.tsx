// components/reader/ExplainStepChat.tsx
// "Explain This Step" — a centered AI Tutor modal anchored to the current selection.
//
// Opens when the student clicks "Explain This Step" in the left toolbar.
// The selected text + page context is sent automatically as the first turn.
// Follow-up questions reuse the same context. The latest answer can be
// saved into NoteLab, RecallLab, or Study Guide Lab via a single "Save" menu.

"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ExplainStepMessage, ExplainStepStudyNotes, ExplainStepNoteRef, ExplainStepRecallRef } from "@/lib/explainStep/types";
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

const SPEECH_OWNER = "explain-step" as const;

export interface ExplainStepContext {
  selectedText: string;
  pageText: string;
  surroundingParagraph: string;
  pageThesis: string | null;
  studyNotes: ExplainStepStudyNotes | null;
  conceptTitles: string[];
  relatedNotes?: ExplainStepNoteRef[];
  relatedRecallCards?: ExplainStepRecallRef[];
  documentTitle?: string;
  pageNumber: number;
}

interface ExplainStepChatProps {
  context: ExplainStepContext;
  onClose: () => void;
  onSaveNote: (question: string, explanation: string, turns: ExplainStepMessage[]) => void | Promise<void>;
  onCreateRecallCard: (question: string, explanation: string, turns: ExplainStepMessage[]) => void | Promise<void>;
  onAddToStudyGuide: (question: string, explanation: string, turns: ExplainStepMessage[]) => void | Promise<void>;
  /** Resume a prior conversation for this same selection/page, if one exists. */
  initialTurns?: ExplainStepMessage[];
  /** Called whenever the conversation changes, so the host can persist it for this selection/page. */
  onTurnsChange?: (turns: ExplainStepMessage[]) => void;
  /** Called when the student wants to see this step/explanation drawn out on the Whiteboard. */
  onVisualize?: (payload: { selectedText: string; explanation: string; pageContext: string }) => void;
}

type ChatTurn = ExplainStepMessage & { id: string };

const QUICK_CHIPS: { label: string; prompt: string }[] = [
  { label: "Why?", prompt: "Why?" },
  { label: "Simpler", prompt: "Explain this simpler" },
  { label: "Example", prompt: "Give me an example" },
  { label: "Visual Analogy", prompt: "Give me a visual analogy for this" },
  { label: "Try It", prompt: "Let me try it myself" },
  { label: "Quiz Me", prompt: "Quiz me on this" },
];

// Section headers the AI Tutor prompt is instructed to use.
const SECTION_MARKERS = ["📌", "🔍", "💡", "⚠️", "🧠", "❓"];

// Sections that start collapsed — the student expands them to go deeper.
const COLLAPSIBLE_HEADERS = ["🔍", "💡", "⚠️"];

interface AnswerSection {
  header: string;
  body: string;
}

/** Split a structured AI Tutor reply into header/body sections for display. */
function parseSections(content: string): AnswerSection[] {
  const lines = content.split("\n");
  const sections: AnswerSection[] = [];
  let current: { header: string; body: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeader = SECTION_MARKERS.some((marker) => trimmed.startsWith(marker));
    if (isHeader) {
      if (current) sections.push({ header: current.header, body: current.body.join("\n").trim() });
      current = { header: trimmed, body: [] };
    } else if (current) {
      current.body.push(line);
    } else {
      current = { header: "", body: [line] };
    }
  }
  if (current) sections.push({ header: current.header, body: current.body.join("\n").trim() });
  return sections.filter((s) => s.header || s.body);
}

export default function ExplainStepChat({
  context,
  onClose,
  onSaveNote,
  onCreateRecallCard,
  onAddToStudyGuide,
  initialTurns,
  onTurnsChange,
  onVisualize,
}: ExplainStepChatProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [savingAction, setSavingAction] = useState<"note" | "recall" | "studyguide" | null>(null);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const globalTokenRef = useRef(0);
  const isStartingRef = useRef(false);

  const lastQuestion = turns.filter((t) => t.role === "user").slice(-1)[0]?.content ?? context.selectedText;
  const lastAnswer = turns.filter((t) => t.role === "assistant").slice(-1)[0]?.content ?? "";

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [turns, loading]);

  // Stop any in-flight speech when the chat closes/unmounts — but only if WE
  // own the shared controller's active slot. Never force-stop a different
  // component's speech just because this one is unmounting.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
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
      const res = await fetch("/api/explainStep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText: context.selectedText,
          pageText: context.pageText,
          surroundingParagraph: context.surroundingParagraph,
          pageThesis: context.pageThesis,
          studyNotes: context.studyNotes,
          conceptTitles: context.conceptTitles,
          relatedNotes: context.relatedNotes,
          relatedRecallCards: context.relatedRecallCards,
          documentTitle: context.documentTitle,
          pageNumber: context.pageNumber,
          messages: history.map(({ role, content }) => ({ role, content })),
          useWebSearch,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.reply) {
        setError(data?.error || "Explanation is unavailable right now.");
        return;
      }
      setTurns((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: data.reply }]);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-send the initial "explain this" turn on open. If nothing is
  // selected, skip the API call and just prompt the student for what
  // they'd like explained on this page.
  useEffect(() => {
    if (initialSentRef.current) return;
    initialSentRef.current = true;
    if (initialTurns && initialTurns.length > 0) {
      setTurns(initialTurns.map((t, i) => ({ ...t, id: `restored-${i}` })));
      return;
    }
    const selected = context.selectedText.trim();
    if (!selected) {
      setTurns([
        {
          id: "a-0",
          role: "assistant",
          content: `No text is selected. What would you like explained on page ${context.pageNumber}?`,
        },
      ]);
      return;
    }
    const firstTurn: ChatTurn = {
      id: "u-0",
      role: "user",
      content: `Explain this step: "${selected.slice(0, 300)}"`,
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

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // "Speak Answer" — reads the tutor's latest reply aloud via /api/tts (OpenAI
  // TTS, with a browser speechSynthesis fallback when the API is unavailable).
  // Clicking again while speaking stops playback.
  const handleSpeakAnswer = async () => {
    if (speaking) {
      // stopAllSpeech (not notifySpeechEnd) so a browser-TTS fallback
      // utterance gets hard-cancelled too, not just the OpenAI <audio>.
      stopAllSpeech("explain-step-stop-button");
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
    // claimSpeech() force-stops any speech currently active anywhere in the
    // app (StudySpeechPanel, PodcastLab, Whiteboard, or a prior Explain Step
    // answer) before this one starts.
    const token = claimSpeech(SPEECH_OWNER);
    globalTokenRef.current = token;
    setTimeout(() => { isStartingRef.current = false; }, 400);
    setSpeaking(true);
    try {
      const cleaned = lastAnswer.replace(/[📌🔍💡⚠️🧠❓]/g, "").trim();
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: cleaned.slice(0, 3000), voice: "alloy", format: "mp3", return: "json" }),
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
        const utter = new SpeechSynthesisUtterance(data.script || cleaned);
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
      if (kind === "note") await onSaveNote(lastQuestion, lastAnswer, plainTurns);
      else if (kind === "recall") await onCreateRecallCard(lastQuestion, lastAnswer, plainTurns);
      else await onAddToStudyGuide(lastQuestion, lastAnswer, plainTurns);
    } finally {
      setSavingAction(null);
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
            <span className="text-lg">🧠</span>
            <span className="text-sm font-semibold tracking-wide text-gray-200">Explain This Step</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-700/60 text-lg leading-none"
            aria-label="Close Explain This Step"
          >
            ✕
          </button>
        </div>

        {/* Selected step preview */}
        {context.selectedText.trim() && (
          <div className="px-5 py-2 border-b border-gray-700/60 shrink-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="uppercase tracking-wide text-[10px] text-gray-500">Selected Step</div>
              {(context.relatedNotes?.length || context.relatedRecallCards?.length) ? (
                <div className="text-[10px] text-indigo-300/80 shrink-0">
                  📎 Using your {[
                    context.relatedNotes?.length ? "notes" : null,
                    context.relatedRecallCards?.length ? "recall cards" : null,
                  ].filter(Boolean).join(" & ")} for this page
                </div>
              ) : null}
            </div>
            <div className="text-sm text-gray-300 line-clamp-2">
              “{context.selectedText.trim().replace(/\s+/g, " ").slice(0, 220)}”
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
          {turns.filter((t) => t.id !== "u-0").map((t) => {
            if (t.role === "user") {
              return (
                <div key={t.id} className="flex justify-end">
                  <div className="max-w-[85%] bg-blue-600/30 border border-blue-500/40 rounded-lg px-3 py-2">
                    {t.content}
                  </div>
                </div>
              );
            }

            const sections = parseSections(t.content);
            const isStructured = sections.some((s) => s.header);
            if (!isStructured) {
              return (
                <div key={t.id} className="text-gray-200 leading-relaxed">
                  {t.content}
                </div>
              );
            }

            return (
              <div key={t.id} className="divide-y divide-gray-700/60 -mx-1">
                {sections.map((s, i) => {
                  const isCollapsible = COLLAPSIBLE_HEADERS.some((marker) => s.header.startsWith(marker));
                  const sectionKey = `${t.id}-${i}`;
                  const isOpen = !isCollapsible || expandedSections.has(sectionKey);
                  return (
                    <div key={i} className="px-1 py-2.5 first:pt-0 last:pb-0">
                      {s.header && (
                        isCollapsible ? (
                          <button
                            onClick={() => toggleSection(sectionKey)}
                            className="w-full flex items-center justify-between text-xs font-semibold tracking-wide text-indigo-300 mb-1 hover:text-indigo-200 transition-colors"
                          >
                            <span>{s.header}</span>
                            <span className="text-[10px] text-gray-500">{isOpen ? "▲" : "▼ tap to expand"}</span>
                          </button>
                        ) : (
                          <div className="text-xs font-semibold tracking-wide text-indigo-300 mb-1">
                            {s.header}
                          </div>
                        )
                      )}
                      {isOpen && (
                        <div className="text-gray-200 leading-relaxed whitespace-pre-wrap">{s.body}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {turns.length === 1 && turns[0]?.id === "u-0" && !loading && (
            <div className="text-gray-400">Reading the selected step…</div>
          )}
          {loading && <div className="text-gray-400">Thinking…</div>}
          {error && (
            <div className="bg-red-900/40 border border-red-700/60 rounded-lg px-3 py-2 text-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Footer: quick chips, save menu, input */}
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
            {context.conceptTitles
              .filter((title) => !context.selectedText.toLowerCase().includes(title.toLowerCase()))
              .slice(0, 2)
              .map((title) => (
                <button
                  key={`relate-${title}`}
                  onClick={() => handleSend(`How does this relate to "${title}"?`)}
                  disabled={loading}
                  className="text-xs px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors disabled:opacity-50 max-w-[160px] truncate"
                  title={`How does this relate to "${title}"?`}
                >
                  Relate to {title}
                </button>
              ))}
            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={useWebSearch}
                onChange={(e) => setUseWebSearch(e.target.checked)}
              />
              Web
            </label>

            <button
              onClick={handleSpeakAnswer}
              disabled={!lastAnswer}
              className="text-xs px-3 py-1 rounded-full bg-emerald-600/30 border border-emerald-500/50 hover:bg-emerald-600/40 transition-colors disabled:opacity-40 ml-auto"
              title={speaking ? "Stop reading the tutor's answer aloud" : "Read the tutor's answer aloud"}
            >
              {speaking ? "⏹ Stop" : "🔊 Speak Answer"}
            </button>

            {onVisualize && (
              <button
                onClick={() =>
                  onVisualize({
                    selectedText: context.selectedText,
                    explanation: lastAnswer,
                    pageContext: context.surroundingParagraph || context.pageText,
                  })
                }
                disabled={!lastAnswer}
                className="text-xs px-3 py-1 rounded-full bg-amber-600/30 border border-amber-500/50 hover:bg-amber-600/40 transition-colors disabled:opacity-40"
                title="Draw this step out on the Whiteboard"
              >
                🎨 Visualize on Whiteboard
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setShowSaveMenu((v) => !v)}
                disabled={!lastAnswer || savingAction !== null}
                className="text-xs px-3 py-1 rounded-full bg-indigo-600/30 border border-indigo-500/50 hover:bg-indigo-600/40 transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {savingAction ? "Saving…" : "Save"} <span className="text-[10px]">▼</span>
              </button>
              {showSaveMenu && (
                <div className="absolute bottom-full right-0 mb-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden text-xs z-10">
                  <button
                    onClick={() => runSave("note")}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors"
                  >
                    📝 Save to NoteLab
                  </button>
                  <button
                    onClick={() => runSave("recall")}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors"
                  >
                    🎯 Create Recall Card
                  </button>
                  <button
                    onClick={() => runSave("studyguide")}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors"
                  >
                    📚 Add to Study Guide
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a follow-up question…"
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
