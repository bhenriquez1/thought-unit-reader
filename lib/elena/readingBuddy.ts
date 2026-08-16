// lib/elena/readingBuddy.ts
// Types for the Elena Reading Buddy — a child-safe, contextual AI reading
// companion. This is NOT a generic chatbot: every response is grounded in the
// active book/page so the buddy behaves like a knowledgeable reading partner,
// not a search engine.

import type { ChildAgeRange } from "./types";

/* ─── Message history ────────────────────────────────────────────────────────── */

export type BuddyRole = "user" | "assistant";

export type BuddyMessage = {
  role:      BuddyRole;
  content:   string;
  /** ISO timestamp — used for display only, not sent to the model */
  createdAt: string;
};

/* ─── Quick-tap prompts ──────────────────────────────────────────────────────── */

export type QuickPrompt = {
  id:    string;
  label: string;
  /** Text injected as the user message */
  text:  string;
};

export const QUICK_PROMPTS: QuickPrompt[] = [
  { id: "quiz",   label: "Quiz me!",          text: "Can you ask me a question about what I just read?" },
  { id: "hard",   label: "What's hard here?", text: "What's the trickiest part of this page?" },
  { id: "why",    label: "Why does it matter?",text: "Why is what I'm reading important?" },
  { id: "sum",    label: "Quick summary",      text: "Can you give me a one-sentence summary of this page?" },
];

/* ─── API request / response ─────────────────────────────────────────────────── */

export type ReadingBuddyRequest = {
  /** The new message from the child */
  message:    string;
  /** Prior conversation (most recent last, capped to last 10 turns) */
  history:    Pick<BuddyMessage, "role" | "content">[];
  /** Child's age range — controls vocabulary complexity */
  ageRange?:  ChildAgeRange;
  /** Child's preferred/display name — used for personalised greetings */
  childName?: string;
  /** Raw text of the current PDF page (max 3 000 chars) */
  pageText?:  string;
  /** Grounded context built from this page's real CanonicalThoughtUnits
   *  (lib/elena/childTeachingAdapter.ts) — preferred over pageText when
   *  present; the server falls back to pageText when it's absent. */
  groundedContext?: string;
  /** Title of the book being read */
  bookTitle?: string;
  /** 1-indexed page number */
  currentPage?: number;
};

export type ReadingBuddyResponse = {
  reply:   string;
  error?:  string;
};
