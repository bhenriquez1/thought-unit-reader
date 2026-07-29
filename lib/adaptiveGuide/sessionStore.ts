// lib/adaptiveGuide/sessionStore.ts
// Zustand+persist store for reading sessions and recall attempts.
// Feeds buildStudentProfile() with real historical data.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ReadingSession, RecallAttempt } from "./studentProfile";

interface SessionState {
  sessions:  ReadingSession[];
  recalls:   RecallAttempt[];

  recordSession(s: ReadingSession): void;
  recordRecall(r: RecallAttempt): void;
  getSessionsForBook(bookId: string): ReadingSession[];
  getRecallsForBook(bookId: string): RecallAttempt[];
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      recalls:  [],

      recordSession(s) {
        set(st => ({ sessions: [...st.sessions, s] }));
      },

      recordRecall(r) {
        set(st => ({ recalls: [...st.recalls, r] }));
      },

      getSessionsForBook(bookId) {
        return get().sessions.filter(s => s.bookId === bookId);
      },

      getRecallsForBook(bookId) {
        return get().recalls.filter(r => r.bookId === bookId);
      },
    }),
    {
      name: "avrrio-sessions-v1",
      partialize: s => ({ sessions: s.sessions, recalls: s.recalls }),
    },
  ),
);
