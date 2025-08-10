// hooks/useAIReview.ts
import { useState } from "react";
import { startReviewSession, autoGradeFlashcard as _autoGrade } from "@/lib/aiReview";

// If your lib exports a ReviewCard type, feel free to import it.
// This local fallback keeps the hook self-contained.
type ReviewCard = {
  id?: string;
  front?: string;
  back?: string;
};

/**
 * AI-based spaced repetition review hook
 * Works with RightBrainNoteEditor, HybridReader, and ProgressiveView
 */
export function useAIReview(userId?: string | null) {
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [queue, setQueue] = useState<ReviewCard[]>([]);
  const [index, setIndex] = useState(0);

  const startReviewMode = async () => {
    if (!userId) {
      alert("⚠️ Please sign in to review cards.");
      return;
    }
    try {
      // NEW: startReviewSession now returns an object, not an array
      const { cards } = await startReviewSession(userId);
      if (!cards || cards.length === 0) {
        alert("🎉 No cards due for review.");
        return;
      }
      setQueue(cards);
      setIndex(0);
      setIsReviewMode(true);
    } catch (err) {
      console.error("❌ Error starting review mode:", err);
      alert("Failed to start review mode.");
    }
  };

  const currentCard = queue[index] ?? null;

  const gradeCard = async () => {
    if (!userId || !currentCard) return;

    try {
      // Be permissive about the grading helper's signature
      const autoGrade = _autoGrade as unknown as (...args: any[]) => Promise<any>;

      // Try the older (userId,id,front,back) form first
      try {
        await autoGrade(userId, currentCard.id, currentCard.front, currentCard.back);
      } catch {
        // Fallback to a simple form (e.g., auto-grade from front text only)
        await autoGrade(currentCard.front ?? "");
      }
    } catch (err) {
      console.warn("Auto-grade failed (continuing review):", err);
    }

    // Advance the queue
    const next = index + 1;
    if (next >= queue.length) {
      alert("✅ Review complete!");
      setIsReviewMode(false);
      setQueue([]);
      setIndex(0);
      return;
    }
    setIndex(next);
  };

  return {
    isReviewMode,
    currentCard,
    startReviewMode,
    gradeCard,
  };
}

export default useAIReview;