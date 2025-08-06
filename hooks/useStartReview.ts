import { useAIReview } from "@/hooks/useAIReview";

export function useStartReview(userId: string) {
  const { isReviewMode, currentCard, startReviewMode, gradeCard } = useAIReview(userId);

  return {
    isReviewMode,
    currentCard,
    startReview: startReviewMode, // Alias to keep naming consistent
    gradeCard
  };
}