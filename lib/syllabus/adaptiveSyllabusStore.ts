// lib/syllabus/adaptiveSyllabusStore.ts
// Zustand store for the Universal Adaptive Syllabus Engine.
// Stores one AdaptiveSyllabus per bookId; persists via localStorage.
// Kept separate from the existing syllabusStore (which handles uploaded-syllabus tracking).

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AdaptiveSyllabus } from "./syllabusSchema";

interface AdaptiveSyllabusState {
  syllabi: Record<string, AdaptiveSyllabus>;   // bookId → syllabus
  setSyllabus:   (bookId: string, syllabus: AdaptiveSyllabus) => void;
  getSyllabus:   (bookId: string) => AdaptiveSyllabus | null;
  clearSyllabus: (bookId: string) => void;
}

const safeLocalStorage = () => {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  return localStorage;
};

export const useAdaptiveSyllabusStore = create<AdaptiveSyllabusState>()(
  persist(
    (set, get) => ({
      syllabi: {},

      setSyllabus: (bookId, syllabus) =>
        set(s => ({ syllabi: { ...s.syllabi, [bookId]: syllabus } })),

      getSyllabus: (bookId) => get().syllabi[bookId] ?? null,

      clearSyllabus: (bookId) =>
        set(s => {
          const { [bookId]: _removed, ...rest } = s.syllabi;
          return { syllabi: rest };
        }),
    }),
    {
      name:            "adaptive-syllabus-store",
      storage:         createJSONStorage(safeLocalStorage),
      skipHydration:   typeof window === "undefined",
    }
  )
);
