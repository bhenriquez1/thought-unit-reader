// lib/flashcardService.ts
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getAIFlashcardGrade } from "@/lib/spacedRepetitionAI";

/**
 * Creates a flashcard from highlighted text and auto‑grades it for spaced repetition.
 * @param text - The highlighted text from the reader
 */
export async function createFlashcardFromSelection(text: string) {
  if (!text.trim()) throw new Error("Cannot create flashcard from empty text");

  // AI decides if this should be "Again", "Hard", "Good", or "Easy"
  const aiGrade = await getAIFlashcardGrade(text);

  const flashcard = {
    question: text,
    answer: "", // Could allow user to fill this later
    aiGrade,
    reviewCount: 0,
    nextReview: serverTimestamp(),
    createdAt: serverTimestamp()
  };

  await addDoc(collection(db, "flashcards"), flashcard);

  return flashcard;
}