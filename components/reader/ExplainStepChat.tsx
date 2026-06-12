// components/reader/ExplainStepChat.tsx
// "Explain This Step" — a contextual chatbox anchored to the current selection.
//
// Opens when the student clicks "Explain This Step" on a LeftPanel selection.
// The selected text + page context is sent automatically as the first turn.
// Follow-up questions reuse the same context. Each assistant reply can be
// saved into NoteLab, RecallLab, or Study Guide Lab.

"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ExplainStepMessage, ExplainStepStudyNotes } from "@/pages/api/explainStep";

export interface ExplainStepContext {
  selectedText: string;
  pageText: string;
  surroundingParagraph: string;
  pageThesis: string | null;
  studyNotes: ExplainStepStudyNotes | null;
  conceptTitles: string[];
  documentTitle?: string;
  pageNumber: number;
}

interface ExplainStepChatProps {
  context: ExplainStepContext;
  onClose: () => void;
  onSaveNote: (question: string, explanation: string) => void | Promise<void>;
  onCreateRecallCard: (question: string, explanation: string) => void | Promise<void>;
  onAddToStudyGuide: (question: string, explanation: string) => void | Promise<void>;
}

type ChatTurn = ExplainStepMessage & { id: string };

const QUICK_PROMPTS = [
  "Explain this simpler",
  "Give me an example",
  "Make a recall card from this",
];

export default function ExplainStepChat({
  context,
  onClose,
  onSaveNote,
  onCreateRecallCard,
  onAddToStudyGuide,
}: ExplainStepChatProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [savingAction, setSavingAction] = useState<"note" | "recall" | "studyguide" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);

  const lastQuestion = turns.filter((t) => t.role === "user").slice(-1)[0]?.content ?? context.selectedText;
  const lastAnswer = turns.filter((t) => t.role === "assistant").slice(-1)[0]?.content ?? "";

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [turns, loading]);

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

  // Auto-send the initial "explain this" turn on open
  useEffect(() => {
    if (initialSentRef.current) return;
    initialSentRef.current = true;
    const firstTurn: ChatTurn = {
      id: "u-0",
      role: "user",
      content: `Explain this step: "${context.selectedText.trim().slice(0, 300)}"`,
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

  const runSave = async (kind: "note" | "recall" | "studyguide") => {
    if (!lastAnswer || savingAction) return;
    setSavingAction(kind);
    try {
      if (kind === "note") await onSaveNote(lastQuestion, lastAnswer);
      else if (kind === "recall") await onCreateRecallCard(lastQuestion, lastAnswer);
      else await onAddToStudyGuide(lastQuestion, lastAnswer);
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 350, damping: 28, mass: 0.8 }}
      className="fixed bottom-6 right-6 z-[10000] w-[min(420px,92vw)] h-[min(560px,80vh)] flex flex-col bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-700 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/60 bg-gray-950/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">💬</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">Explain This Step</div>
            <div className="text-xs text-gray-400 truncate max-w-[260px]">
              “{context.selectedText.trim().replace(/\s+/g, " ").slice(0, 80)}”
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="hover:text-red-400 transition-colors text-sm px-1"
          title="Close"
          aria-label="Close Explain This Step"
        >
          ✖
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
        {turns.filter((t) => t.id !== "u-0").map((t) => (
          <div
            key={t.id}
            className={
              t.role === "user"
                ? "self-end ml-8 bg-blue-600/30 border border-blue-500/40 rounded-lg px-3 py-2"
                : "mr-8 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
            }
          >
            {t.content}
          </div>
        ))}
        {turns.length === 1 && !loading && (
          <div className="mr-8 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-400">
            Reading the selected step…
          </div>
        )}
        {loading && (
          <div className="mr-8 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-400">
            Thinking…
          </div>
        )}
        {error && (
          <div className="mr-8 bg-red-900/40 border border-red-700/60 rounded-lg px-3 py-2 text-red-200">
            {error}
          </div>
        )}
      </div>

      {/* Save actions */}
      {lastAnswer && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700/60 bg-gray-950/40 text-xs">
          <button
            onClick={() => runSave("note")}
            disabled={savingAction !== null}
            className="px-2 py-1 rounded bg-amber-600/20 border border-amber-600/40 hover:bg-amber-600/30 transition-colors disabled:opacity-50"
          >
            {savingAction === "note" ? "Saving…" : "📝 Save to NoteLab"}
          </button>
          <button
            onClick={() => runSave("recall")}
            disabled={savingAction !== null}
            className="px-2 py-1 rounded bg-green-600/20 border border-green-600/40 hover:bg-green-600/30 transition-colors disabled:opacity-50"
          >
            {savingAction === "recall" ? "Saving…" : "🎯 Create Recall Card"}
          </button>
          <button
            onClick={() => runSave("studyguide")}
            disabled={savingAction !== null}
            className="px-2 py-1 rounded bg-purple-600/20 border border-purple-600/40 hover:bg-purple-600/30 transition-colors disabled:opacity-50"
          >
            {savingAction === "studyguide" ? "Saving…" : "📚 Add to Study Guide"}
          </button>
        </div>
      )}

      {/* Quick prompts */}
      <div className="flex items-center gap-1.5 px-3 pt-2 flex-wrap">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => handleSend(p)}
            disabled={loading}
            className="text-xs px-2 py-1 rounded-full bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {p}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={useWebSearch}
            onChange={(e) => setUseWebSearch(e.target.checked)}
          />
          Web enrichment
        </label>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2">
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
    </motion.div>
  );
}
