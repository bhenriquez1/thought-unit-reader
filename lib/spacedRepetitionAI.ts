// lib/spacedRepetitionAI.ts
/**
 * Uses AI to decide if a flashcard is "Again", "Hard", "Good", or "Easy".
 * The grading is based on how well the text could be remembered in context.
 */
export async function getAIFlashcardGrade(text: string): Promise<"Again" | "Hard" | "Good" | "Easy"> {
  const response = await fetch("/api/gradeFlashcard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `Based on this flashcard question: "${text}",
decide the recall difficulty for spaced repetition review.
Return exactly one word: Again, Hard, Good, or Easy.`
    })
  });

  if (!response.ok) throw new Error(`AI grading failed: ${response.status}`);
  const data = await response.json();
  return data.grade || "Good";
}