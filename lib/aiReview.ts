// hooks/useAIReview.ts
import { useState } from "react";
import { getDueFlashcards, updateFlashcardReview } from "@/lib/noteService";

type GradeType = "again" | "hard" | "good" | "easy";

export function useAIReview(userId?: string) {
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [currentCard, setCurrentCard] = useState<any | null>(null);

  /** Placeholder for AI difficulty grading (replace with GPT later) */
  const aiGradeFlashcardAnswer = (): GradeType => {
    const difficulty = Math.random();
    if (difficulty < 0.25) return "again";
    if (difficulty < 0.5) return "hard";
    if (difficulty < 0.8) return "good";
    return "easy";
  };

  /** Start review mode */
  const startReview = async () => {
    if (!userId) {
      alert("Sign in to review cards.");
      return;
    }
    const due = await getDueFlashcards(userId);
    if (due.length === 0) {
      alert("No cards due for review 🎉");
      return;
    }
    setReviewQueue(due);
    setCurrentCard(due[0]);
    setIsReviewMode(true);
  };

  /** Grade and move to next card */
  const gradeCard = async () => {
    if (!userId || !currentCard) return;
    const grade = aiGradeFlashcardAnswer();
    await updateFlashcardReview(userId, currentCard.id, grade);

    const remaining = reviewQueue.slice(1);
    setReviewQueue(remaining);
    setCurrentCard(remaining[0] || null);

    if (remaining.length === 0) {
      alert("✅ Review complete!");
      setIsReviewMode(false);
    }
  };

  /** Exit review mode */
  const exitReview = () => {
    setIsReviewMode(false);
    setReviewQueue([]);
    setCurrentCard(null);
  };

  return {
    isReviewMode,
    currentCard,
    startReview,
    gradeCard,
    exitReview
  };
}