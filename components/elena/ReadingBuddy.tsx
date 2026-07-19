// components/elena/ReadingBuddy.tsx
// Reading Buddy — child-safe, contextual AI companion embedded in the Elena
// Reading tab. Behaves as a reading partner (Socratic, page-grounded, age-
// adaptive), NOT as a generic chatbot or search engine.

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { ChildProfile } from "@/lib/elena/types";
import type { BuddyMessage } from "@/lib/elena/readingBuddy";
import { QUICK_PROMPTS } from "@/lib/elena/readingBuddy";

/* ─── Props ──────────────────────────────────────────────────────────────────── */

interface ReadingBuddyProps {
  profile:          ChildProfile;
  pageText?:        string;
  bookTitle?:       string;
  currentPage?:     number;
  /** Start in open state (used by AskPagePanel which controls open/close externally) */
  defaultOpen?:     boolean;
  /** Called when the close button is clicked in defaultOpen mode */
  onRequestClose?:  () => void;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function now(): string {
  return new Date().toISOString();
}

const BUDDY_AVATAR = "🦉";
const MAX_HISTORY  = 10;

/* ─── Component ──────────────────────────────────────────────────────────────── */

export default function ReadingBuddy({
  profile,
  pageText,
  bookTitle,
  currentPage,
  defaultOpen,
  onRequestClose,
}: ReadingBuddyProps) {
  const [messages,  setMessages]  = useState<BuddyMessage[]>([]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [open,      setOpen]      = useState(defaultOpen ?? false);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const abortRef    = useRef<AbortController | null>(null);

  // Reset conversation when reading context changes (new book or page turn)
  const prevContextRef = useRef<string>("");
  useEffect(() => {
    const key = `${bookTitle ?? ""}:${currentPage ?? ""}`;
    if (prevContextRef.current && prevContextRef.current !== key) {
      setMessages([]);
    }
    prevContextRef.current = key;
  }, [bookTitle, currentPage]);

  // Greeting message on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      const greeting = bookTitle
        ? `Hi ${profile.preferredName || profile.displayName}! 👋 I'm your Reading Buddy. I see you're reading "${bookTitle}"${currentPage ? ` (page ${currentPage})` : ""}. What would you like to talk about?`
        : `Hi ${profile.preferredName || profile.displayName}! 👋 I'm your Reading Buddy. I'm here to help you understand what you're reading. What's on your mind?`;
      setMessages([{ role: "assistant", content: greeting, createdAt: now() }]);
    }
  }, [open, messages.length, profile, bookTitle, currentPage]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    setInput("");

    const userMsg: BuddyMessage = { role: "user", content: trimmed, createdAt: now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const history = messages
        .slice(-MAX_HISTORY)
        .map(m => ({ role: m.role, content: m.content }));

      const resp = await fetch("/api/elena-buddy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:     trimmed,
          history,
          ageRange:    profile.ageRange,
          childName:   profile.preferredName || profile.displayName,
          pageText,
          bookTitle,
          currentPage,
        }),
        signal: abortRef.current.signal,
      });

      const data = await resp.json();

      if (!resp.ok || data.error) {
        setError(data.error || "Reading Buddy is having trouble right now. Try again!");
        return;
      }

      setMessages(prev => [
        ...prev,
        { role: "assistant", content: data.reply, createdAt: now() },
      ]);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Reading Buddy is taking a break. Try again in a moment!");
    } finally {
      setLoading(false);
    }
  }, [loading, messages, profile, pageText, bookTitle, currentPage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  /* ─── Closed state — floating button ─────────────────────────────────────── */

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 hover:bg-indigo-500/30 transition-colors text-sm font-medium text-indigo-200"
        aria-label="Open Reading Buddy"
      >
        <span className="text-xl">{BUDDY_AVATAR}</span>
        <span>Ask Reading Buddy</span>
      </button>
    );
  }

  /* ─── Open state — chat panel ─────────────────────────────────────────────── */

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-indigo-950/60 to-violet-950/60 border border-indigo-400/20 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-900/40 border-b border-indigo-400/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{BUDDY_AVATAR}</span>
          <div>
            <div className="text-sm font-semibold text-indigo-100">Reading Buddy</div>
            {bookTitle && (
              <div className="text-[10px] text-indigo-400 truncate max-w-[180px]">
                {bookTitle}{currentPage ? ` · p.${currentPage}` : ""}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => { setOpen(false); onRequestClose?.(); }}
          className="text-indigo-400 hover:text-indigo-200 transition-colors text-lg leading-none p-1"
          aria-label="Close Reading Buddy"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <span className="text-xl flex-shrink-0 mt-0.5">{BUDDY_AVATAR}</span>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === "assistant"
                  ? "bg-indigo-800/50 text-indigo-100 rounded-tl-sm"
                  : "bg-violet-600/60 text-white rounded-tr-sm"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 justify-start">
            <span className="text-xl">{BUDDY_AVATAR}</span>
            <div className="bg-indigo-800/50 rounded-2xl rounded-tl-sm px-3 py-2">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center text-xs text-red-400 bg-red-900/20 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick prompts — only show when chat is fresh */}
      {messages.length <= 1 && !loading && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hide flex-shrink-0">
          {QUICK_PROMPTS.map(qp => (
            <button
              key={qp.id}
              onClick={() => sendMessage(qp.text)}
              className="flex-none text-xs bg-indigo-700/40 hover:bg-indigo-700/60 border border-indigo-500/30 text-indigo-200 rounded-full px-3 py-1.5 transition-colors whitespace-nowrap"
            >
              {qp.label}
            </button>
          ))}
          {pageText && (
            <button
              onClick={() => sendMessage("What's the most important thing on this page?")}
              className="flex-none text-xs bg-violet-700/40 hover:bg-violet-700/60 border border-violet-500/30 text-violet-200 rounded-full px-3 py-1.5 transition-colors whitespace-nowrap"
            >
              📄 About this page
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2 px-3 pb-3 pt-1 flex-shrink-0 border-t border-indigo-400/20">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything about your book…"
          rows={1}
          className="flex-1 resize-none bg-indigo-900/40 border border-indigo-500/30 rounded-xl px-3 py-2 text-sm text-white placeholder-indigo-400/60 focus:outline-none focus:border-indigo-400 transition-colors"
          style={{ maxHeight: "96px" }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="flex-shrink-0 w-9 h-9 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          aria-label="Send"
        >
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
