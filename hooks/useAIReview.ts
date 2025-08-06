// hooks/useAIReview.ts
import { useState } from "react";
import { startReviewSession, autoGradeFlashcard } from "@/lib/aiReview"; // <-- Your AI review helper functions

/**
 * Hook to handle AI-based spaced repetition review mode
 * Works with RightBrainNoteEditor, HybridReader, and ProgressiveView
 */
export function useAIReview(userId?: string | null) {
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [currentCard, setCurrentCard] = useState<any | null>(null);

  /** Start a review session */
  const startReviewMode = async () => {
    if (!userId) {
      alert("⚠️ Please sign in to review cards.");
      return;
    }
    try {
      const due = await startReviewSession(userId);
      if (!due || due.length === 0) {
        alert("🎉 No cards due for review.");
        return;
      }
      setReviewQueue(due);
      setCurrentCard(due[0]);
      setIsReviewMode(true);
    } catch (err) {
      console.error("❌ Error starting review mode:", err);
      alert("Failed to start review mode.");
    }
  };

  /** Grade the current card and move to the next */
  const gradeCard = async () => {
    if (!userId || !currentCard) return;
    try {
      await autoGradeFlashcard(userId, currentCard.id, currentCard.front, currentCard.back);

      const remaining = reviewQueue.slice(1);
      setReviewQueue(remaining);
      setCurrentCard(remaining[0] || null);

      if (remaining.length === 0) {
        alert("✅ Review complete!");
        setIsReviewMode(false);
      }
    } catch (err) {
      console.error("❌ Error grading card:", err);
    }
  };

  return {
    isReviewMode,
    currentCard,
    startReviewMode,
    gradeCard
  };
}