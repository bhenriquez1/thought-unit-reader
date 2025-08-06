import { useAIReview } from "@/hooks/useAIReview";

/**
 * Wrapper hook for consistent "startReview" naming across the app.
 * It aliases `startReviewMode` from useAIReview so ProgressiveView,
 * HybridReader, and Toolbar can all call `startReview` without errors.
 */
export function useStartReview(userId: string) {
  const {
    isReviewMode,
    currentCard,
    startReviewMode, // original from useAIReview
    gradeCard
  } = useAIReview(userId);

  return {
    isReviewMode,
    currentCard,
    startReview: startReviewMode, // alias for compatibility
    gradeCard
  };
}