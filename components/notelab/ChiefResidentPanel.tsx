"use client";
// components/notelab/ChiefResidentPanel.tsx
// 🩺 Chief Resident — adaptive AI teaching mode in NoteLab.
// Replaces the passive "Listen" experience with an interactive teaching session
// that auto-detects subject, selects teaching persona, and teaches one concept at a time.

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import { saveUltraNote, type UltraNote } from "@/lib/notelab/ultraNoteStore";
import { composeNoteNotebookSceneInBackground } from "@/lib/notelab/composeNotebookScene";
import type { TeachingMode, TeachingAudience } from "@/pages/api/chief-resident-teaching";
import { buildRecallSetFromNote, saveRecallSet } from "@/lib/recalllab/recallStore";
import { useCurrentLearningContext } from "@/lib/context/learningContext";
import {
  buildChiefResidentContext,
  matchesFrozenSnapshot,
  type ChiefResidentFrozenSnapshot,
} from "@/lib/reader/buildChiefResidentContext";
import {
  resolveChiefResidentTurn,
  shouldOfferDelegation,
  type ChiefResidentDelegation,
  type ChiefResidentDelegationTarget,
} from "@/lib/chiefResident/chiefResidentAgent";
import ChiefResidentVoiceCall from "@/components/notelab/ChiefResidentVoiceCall";
import type { CurrentPageTruth } from "@/lib/context/currentPageTruth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeachingTurn {
  role: "user" | "assistant";
  content: string;
  /** CR1 — set only on the one assistant turn (if any) where the Chief
   *  Resident Agent decided a handoff was worth offering, and only the
   *  first time that target was offered this session. */
  delegation?: ChiefResidentDelegation;
}

interface ChiefResidentPanelProps {
  studyModel: CurrentPageStudyModel | null;
  /** The same immutable source snapshot used by every page specialist. */
  pageTruth: CurrentPageTruth;
  bookTitle?: string;
  activeNote: UltraNote | null;
  onRecallSaved?: (setId: string) => void;
}

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

const MODES: { key: TeachingMode; label: string; icon: string; description: string; needsNote?: boolean }[] = [
  { key: "teach-page",        label: "Teach This Page",        icon: "📖", description: "Interactive lesson from the current reader page" },
  { key: "teach-note",        label: "Teach This Note",        icon: "📝", description: "Teach from your active note", needsNote: true },
  { key: "teach-study-sheet", label: "Teach This Study Sheet", icon: "📑", description: "Lesson based on the Study Sheet content" },
  { key: "case-based",        label: "Case-Based Teaching",    icon: "🏥", description: "AI generates a case, you reason through it" },
  { key: "rapid-fire",        label: "Rapid-Fire Questions",   icon: "⚡", description: "Fast Q&A — one question, one answer, move on" },
  { key: "explain-mistake",   label: "Explain My Mistake",     icon: "🔍", description: "Describe what you got wrong; AI corrects your reasoning" },
];

// ---------------------------------------------------------------------------
// Source text builders
// ---------------------------------------------------------------------------

function buildPageSourceText(studyModel: CurrentPageStudyModel | null, pageText: string): string {
  const parts: string[] = [];
  if (studyModel?.pageThesis) parts.push(`Thesis: ${studyModel.pageThesis}`);
  if (studyModel?.studyNotes) {
    const sn = studyModel.studyNotes;
    if (sn.whyThisMatters) parts.push(`Why This Matters: ${sn.whyThisMatters}`);
    if (sn.keyMechanism)    parts.push(`Key Mechanism: ${sn.keyMechanism}`);
    if (sn.commonConfusion) parts.push(`Common Confusion: ${sn.commonConfusion}`);
    if (sn.quickMemory)     parts.push(`Memory Anchor: ${sn.quickMemory}`);
    if (sn.examSignal)      parts.push(`Exam Signal: ${sn.examSignal}`);
  }
  if (studyModel?.conceptBlocks?.length) {
    parts.push("\nConcepts:");
    studyModel.conceptBlocks.forEach((cb, i) => {
      if (cb.title) parts.push(`${i + 1}. ${cb.title}${cb.mechanism ? ": " + cb.mechanism : ""}`);
    });
  }
  if (!parts.length && pageText) parts.push(pageText.slice(0, 3000));
  return parts.join("\n").trim() || pageText.slice(0, 3000);
}

function buildNoteSourceText(note: UltraNote): string {
  const parts = [`Topic: ${note.topic}`, `Core Idea: ${note.coreIdea}`];
  if (note.concepts?.length) {
    parts.push("\nConcepts:");
    note.concepts.forEach(c => {
      parts.push(`\n${c.ordinal}. ${c.title}`);
      if (c.pattern)        parts.push(`   Pattern: ${c.pattern}`);
      if (c.surgicalReason) parts.push(`   Why it works: ${c.surgicalReason}`);
      if (c.trap)           parts.push(`   Trap: ${c.trap}`);
      if (c.rule)           parts.push(`   Rule: ${c.rule}`);
    });
  }
  if (note.memoryShortcuts?.length) parts.push(`\nMemory Shortcuts: ${note.memoryShortcuts.join("; ")}`);
  if (note.sections?.length) {
    note.sections.forEach(s => { if (s.content) parts.push(`\n${s.label}:\n${s.content}`); });
  }
  return parts.join("\n").trim();
}

function buildStudySheetSourceText(studyModel: CurrentPageStudyModel | null, pageText: string): string {
  // Uses the same model that StudyGuideLab generates from; delegates to page source
  return buildPageSourceText(studyModel, pageText);
}

// ---------------------------------------------------------------------------
// Streaming fetch utility
// ---------------------------------------------------------------------------

async function streamTeachingSession(
  body:   object,
  frozen: ChiefResidentFrozenSnapshot,
  onToken: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch("/api/chief-resident-teaching", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(errBody.error || `Chief Resident unavailable (${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return accumulated;
      try {
        const parsed = JSON.parse(data);
        // Discard any event that doesn't match the frozen snapshot this
        // request was built from — see ChiefResidentModal.tsx's identical
        // check for the full rationale (same shared validation function).
        if (!matchesFrozenSnapshot(parsed, frozen)) {
          console.warn("[CHIEF_RESIDENT_STALE_EVENT_DISCARDED]", { got: parsed, expected: frozen });
          continue;
        }
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) {
          accumulated += parsed.text;
          onToken(parsed.text);
        }
      } catch (e) {
        if ((e as Error).message !== "Unexpected end of JSON input") throw e;
      }
    }
  }
  return accumulated;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------


export default function ChiefResidentPanel({
  studyModel,
  pageTruth,
  bookTitle,
  activeNote,
  onRecallSaved,
}: ChiefResidentPanelProps) {
  const { bookId, pageNumber: currentPage, pageTruthKey, pageText, documentId } = pageTruth;
  const teachingAudience = useCurrentLearningContext(state => state.teachingAudience) as TeachingAudience;
  const [selectedMode, setSelectedMode] = useState<TeachingMode | null>(null);
  const [sessionMessages, setSessionMessages] = useState<TeachingTurn[]>([]);
  const [streamingBuffer, setStreamingBuffer] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [sessionDone, setSessionDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // CR1 — the Chief Resident Agent never offers the same delegation target
  // twice in one session (see chiefResidentAgent.ts's shouldOfferDelegation).
  // A ref, not state: membership is only ever read/written inside the
  // streaming callbacks below, never rendered directly.
  const offeredDelegationsRef = useRef<Set<ChiefResidentDelegationTarget>>(new Set());
  const [notelabDelegationState, setNotelabDelegationState] = useState<"idle" | "composing" | "done">("idle");
  // CR2 — a live voice call is a wholly separate flow from the text mode
  // picker/session below (its own WebRTC connection, no sessionMessages
  // transcript, no selectedMode) — this flag short-circuits everything else
  // in this component rather than threading voice state through it.
  const [voiceCallActive, setVoiceCallActive] = useState(false);

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionMessages, streamingBuffer]);

  // Reset session when page/book changes
  useEffect(() => {
    abortRef.current?.abort();
    setSelectedMode(null);
    setSessionMessages([]);
    setStreamingBuffer("");
    setHasStarted(false);
    setSessionDone(false);
    setError(null);
    offeredDelegationsRef.current = new Set();
    setNotelabDelegationState("idle");
    setVoiceCallActive(false);
  }, [bookId, currentPage, pageTruthKey]);

  // CR1 — turns a completed turn's raw text into the TeachingTurn the
  // transcript actually stores: strips any delegation directive out of the
  // visible content, and attaches it to the turn only the first time that
  // target is offered this session.
  const finalizeAssistantTurn = useCallback((full: string): TeachingTurn => {
    const { visibleText, delegation } = resolveChiefResidentTurn(full);
    if (delegation && shouldOfferDelegation(delegation.target, offeredDelegationsRef.current)) {
      offeredDelegationsRef.current.add(delegation.target);
      return { role: "assistant", content: visibleText, delegation };
    }
    return { role: "assistant", content: visibleText };
  }, []);

  const handleDelegateToNotelab = useCallback(async () => {
    if (!activeNote || notelabDelegationState !== "idle") return;
    setNotelabDelegationState("composing");
    try {
      await saveUltraNote({ ...activeNote, notebookSceneStatus: "pending" });
      await composeNoteNotebookSceneInBackground(activeNote, activeNote.documentId ?? activeNote.bookId);
    } catch (err) {
      console.error("[CHIEF_RESIDENT_DELEGATE_NOTELAB_FAILED]", String(err));
    } finally {
      setNotelabDelegationState("done");
    }
  }, [activeNote, notelabDelegationState]);

  const getSourceText = useCallback((mode: TeachingMode): string => {
    if (mode === "teach-note") return activeNote ? buildNoteSourceText(activeNote) : "";
    if (mode === "teach-study-sheet") return buildStudySheetSourceText(studyModel, pageText);
    return buildPageSourceText(studyModel, pageText);
  }, [studyModel, pageText, activeNote]);

  const startSession = useCallback(async (mode: TeachingMode) => {
    const src = getSourceText(mode);
    if (!src.trim()) {
      setError(mode === "teach-note" ? "Open a note in the Notes tab first." : "No content found for this page yet.");
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setSelectedMode(mode);
    setSessionMessages([]);
    setStreamingBuffer("");
    setSessionDone(false);
    setError(null);
    setHasStarted(true);
    setIsStreaming(true);

    const frozen: ChiefResidentFrozenSnapshot = {
      documentId, pageNumber: currentPage, pageTruthKey, pageText: src,
    };
    try {
      let accumulated = "";
      const body = buildChiefResidentContext({ ...frozen, title: bookTitle, mode, audience: teachingAudience, messages: [] });
      const full = await streamTeachingSession(
        body,
        frozen,
        (token) => { accumulated += token; setStreamingBuffer(accumulated); },
        abortRef.current.signal
      );
      setSessionMessages([finalizeAssistantTurn(full)]);
      setStreamingBuffer("");
      if (full.includes("📋 Before Rounds") || full.includes("Before Rounds:")) setSessionDone(true);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setIsStreaming(false);
    }
  }, [getSourceText, bookTitle, teachingAudience, documentId, currentPage, pageTruthKey, finalizeAssistantTurn]);

  const sendUserReply = useCallback(async () => {
    const msg = userInput.trim();
    if (!msg || isStreaming || !selectedMode) return;

    const src = getSourceText(selectedMode);
    const updatedMessages: TeachingTurn[] = [...sessionMessages, { role: "user", content: msg }];
    setSessionMessages(updatedMessages);
    setUserInput("");
    setIsStreaming(true);
    setError(null);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const frozen: ChiefResidentFrozenSnapshot = {
      documentId, pageNumber: currentPage, pageTruthKey, pageText: src,
    };
    try {
      let accumulated = "";
      const body = buildChiefResidentContext({ ...frozen, title: bookTitle, mode: selectedMode, audience: teachingAudience, messages: updatedMessages });
      const full = await streamTeachingSession(
        body,
        frozen,
        (token) => { accumulated += token; setStreamingBuffer(accumulated); },
        abortRef.current.signal
      );
      setSessionMessages(prev => [...prev, finalizeAssistantTurn(full)]);
      setStreamingBuffer("");
      if (full.includes("📋 Before Rounds") || full.includes("Before Rounds:")) setSessionDone(true);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setIsStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [userInput, isStreaming, selectedMode, teachingAudience, sessionMessages, getSourceText, bookTitle, documentId, currentPage, pageTruthKey, finalizeAssistantTurn]);

  const requestSummary = useCallback(async () => {
    if (isStreaming || !selectedMode) return;
    const src = getSourceText(selectedMode);
    const updatedMessages: TeachingTurn[] = [
      ...sessionMessages,
      { role: "user", content: "Please give me the 📋 Before Rounds summary now." },
    ];
    setSessionMessages(updatedMessages);
    setIsStreaming(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const frozen: ChiefResidentFrozenSnapshot = {
      documentId, pageNumber: currentPage, pageTruthKey, pageText: src,
    };
    try {
      let accumulated = "";
      const body = buildChiefResidentContext({ ...frozen, title: bookTitle, mode: selectedMode, audience: teachingAudience, messages: updatedMessages });
      const full = await streamTeachingSession(
        body,
        frozen,
        (token) => { accumulated += token; setStreamingBuffer(accumulated); },
        abortRef.current.signal
      );
      setSessionMessages(prev => [...prev, finalizeAssistantTurn(full)]);
      setStreamingBuffer("");
      setSessionDone(true);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, selectedMode, teachingAudience, sessionMessages, getSourceText, bookTitle, documentId, currentPage, pageTruthKey, finalizeAssistantTurn]);

  const sendToRecall = useCallback(async () => {
    if (!activeNote) return;
    const set = buildRecallSetFromNote(activeNote, { bookTitle });
    await saveRecallSet(set);
    onRecallSaved?.(set.id);
  }, [activeNote, bookTitle, onRecallSaved]);

  // ---------------------------------------------------------------------------
  // Render — live voice call (CR2)
  // ---------------------------------------------------------------------------

  if (voiceCallActive) {
    return (
      <ChiefResidentVoiceCall
        sourceContext={{
          sourceText: getSourceText("teach-page"),
          title: bookTitle,
          pageNumber: currentPage,
          audience: teachingAudience,
        }}
        activeNote={activeNote}
        onExit={() => setVoiceCallActive(false)}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render — idle (mode picker)
  // ---------------------------------------------------------------------------

  if (!hasStarted) {
    return (
      <div className="flex flex-col h-full bg-[rgb(11,18,34)] overflow-y-auto">
        <div className="p-5">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-white/80">🩺 Chief Resident</h2>
            <p className="mt-1 text-[11.5px] text-white/40 leading-relaxed">
              An adaptive AI tutor that teaches from your content. Select a teaching mode to begin.
            </p>
          </div>

          {/* Detected context — sourced from the open PDF, not a learner persona */}
          {bookTitle && (
            <div className="mb-4 flex items-center gap-1.5">
              <div className="text-[10px] text-white/35 uppercase tracking-wider">Reading</div>
              <span className="px-2.5 py-1 rounded-full text-[11px] border border-emerald-500/40 bg-emerald-900/25 text-emerald-300 font-medium">
                {bookTitle.length > 36 ? bookTitle.slice(0, 36) + "…" : bookTitle}
              </span>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-900/20 px-3 py-2 text-[11.5px] text-rose-300">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={() => setVoiceCallActive(true)}
              className="w-full text-left rounded-xl border px-4 py-3.5 transition-colors border-sky-700/30 bg-sky-900/15 hover:bg-sky-900/25 hover:border-sky-600/40 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🎙️</span>
                <div>
                  <div className="text-[12.5px] font-semibold text-white/85">Talk Live</div>
                  <div className="text-[11px] text-white/40 mt-0.5">Have a real spoken conversation about this page</div>
                </div>
              </div>
            </button>
            {MODES.map(m => {
              const disabled = m.needsNote && !activeNote;
              return (
                <button
                  key={m.key}
                  onClick={() => !disabled && startSession(m.key)}
                  disabled={disabled}
                  className={`w-full text-left rounded-xl border px-4 py-3.5 transition-colors ${
                    disabled
                      ? "border-white/5 bg-white/2 opacity-40 cursor-not-allowed"
                      : "border-white/10 bg-white/5 hover:bg-emerald-900/20 hover:border-emerald-600/30 cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{m.icon}</span>
                    <div>
                      <div className="text-[12.5px] font-semibold text-white/85">{m.label}</div>
                      <div className="text-[11px] text-white/40 mt-0.5">{m.description}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="mt-5 text-[10.5px] text-white/25 leading-relaxed">
            Teaching sessions use the current page, your active note, or the Study Sheet as the source.
            After each session, you can send key concepts to Recall.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — active session
  // ---------------------------------------------------------------------------

  const activeModeMeta = MODES.find(m => m.key === selectedMode);

  return (
    <div className="flex flex-col h-full bg-[rgb(11,18,34)]">
      {/* Session header */}
      <div className="flex-shrink-0 border-b border-white/10 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">{activeModeMeta?.icon}</span>
        <span className="text-[12px] font-semibold text-white/70">{activeModeMeta?.label}</span>
        <div className="ml-auto flex items-center gap-2">
          {sessionMessages.length >= 4 && !sessionDone && !isStreaming && (
            <button
              onClick={requestSummary}
              className="px-2.5 py-1 rounded text-[11px] font-medium text-amber-300 bg-amber-900/20 hover:bg-amber-900/35 border border-amber-700/30 transition-colors"
            >
              📋 Summarize
            </button>
          )}
          <button
            onClick={() => { abortRef.current?.abort(); setHasStarted(false); setSelectedMode(null); setSessionMessages([]); setStreamingBuffer(""); setSessionDone(false); setError(null); }}
            className="px-2.5 py-1 rounded text-[11px] text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
          >
            ← Modes
          </button>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {sessionMessages.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-xl px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-wrap ${
              turn.role === "user"
                ? "bg-emerald-900/30 text-emerald-100 border border-emerald-700/20"
                : "bg-white/5 text-slate-200 border border-white/8"
            }`}>
              {turn.role === "assistant" && <span className="text-[10px] font-bold text-emerald-400/70 block mb-1.5">🩺 Chief Resident</span>}
              {turn.content}
              {turn.delegation && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-[11px] text-white/50 mb-2">{turn.delegation.reason}</p>
                  {turn.delegation.target === "notelab" ? (
                    activeNote ? (
                      <button
                        onClick={handleDelegateToNotelab}
                        disabled={notelabDelegationState !== "idle"}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-sky-300 bg-sky-900/25 hover:bg-sky-900/40 border border-sky-700/30 disabled:opacity-50 transition-colors"
                      >
                        {notelabDelegationState === "composing" ? "Composing…" : notelabDelegationState === "done" ? "✓ Sent to NoteLab" : "📝 Compose this into NoteLab"}
                      </button>
                    ) : (
                      <p className="text-[10.5px] text-white/30">Save a note for this page first, then this can be composed into NoteLab.</p>
                    )
                  ) : (
                    // CR1 — Whiteboard delegation is a validated signal only;
                    // actually opening Whiteboard Mode requires plumbing a
                    // callback through this panel's two different parents
                    // (ChiefResidentModalShell in the Reader vs. the NoteLab
                    // tab), which is out of scope for this pass.
                    <p className="text-[10.5px] text-white/30">Open Whiteboard Mode to continue this visually.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming buffer */}
        {isStreaming && streamingBuffer && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-xl px-4 py-3 text-[12.5px] leading-relaxed bg-white/5 text-slate-200 border border-white/8 whitespace-pre-wrap">
              <span className="text-[10px] font-bold text-emerald-400/70 block mb-1.5">🩺 Chief Resident</span>
              {streamingBuffer}
              <span className="animate-pulse ml-0.5 text-emerald-400">▌</span>
            </div>
          </div>
        )}

        {/* Typing indicator (no buffer yet) */}
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

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-900/20 px-3 py-2 text-[11.5px] text-rose-300">
            {error}
          </div>
        )}

        {/* Session complete — show Recall button */}
        {sessionDone && (
          <div className="rounded-xl border border-emerald-600/20 bg-emerald-900/10 px-4 py-3 text-center">
            <p className="text-[11.5px] text-emerald-300/80 mb-3">Teaching session complete.</p>
            {activeNote && (
              <button
                onClick={sendToRecall}
                className="px-4 py-2 rounded-lg bg-emerald-700/30 hover:bg-emerald-700/50 border border-emerald-600/30 text-[12px] font-semibold text-emerald-300 transition-colors"
              >
                📤 Add note concepts to Recall
              </button>
            )}
            <button
              onClick={() => { setHasStarted(false); setSelectedMode(null); setSessionMessages([]); setStreamingBuffer(""); setSessionDone(false); }}
              className="block mx-auto mt-2.5 text-[11px] text-white/30 hover:text-white/60 underline"
            >
              Start another session
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!sessionDone && (
        <div className="flex-shrink-0 border-t border-white/10 p-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendUserReply(); } }}
              disabled={isStreaming}
              placeholder={isStreaming ? "Chief Resident is teaching…" : "Your answer (Enter to send, Shift+Enter for newline)"}
              rows={2}
              className="flex-1 resize-none rounded-lg bg-white/5 border border-white/10 text-[12.5px] text-white/85 placeholder:text-white/25 px-3 py-2 focus:outline-none focus:border-emerald-600/50 disabled:opacity-40"
            />
            <button
              onClick={sendUserReply}
              disabled={isStreaming || !userInput.trim()}
              className="h-[52px] px-4 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 text-white text-[12px] font-semibold transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
