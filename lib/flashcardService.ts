// lib/flashcardService.ts
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getAIFlashcardGrade } from "@/lib/spacedRepetitionAI";

/**
 * Creates a flashcard from highlighted text and (optionally) tags it with page/book/user.
 * Backward compatible:
 *  - createFlashcardFromSelection(text)
 *  - createFlashcardFromSelection(text, page)
 *  - createFlashcardFromSelection(text, page, { userId, bookId })
 */
export async function createFlashcardFromSelection(
  text: string,
  page?: number,
  opts?: { userId?: string; bookId?: string }
) {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("Cannot create flashcard from empty text");

  const aiGrade = await getAIFlashcardGrade(trimmed);

  const { userId, bookId } = opts || {};

  const flashcard = {
    question: trimmed,
    answer: "", // optional; user can edit later
    aiGrade,
    reviewCount: 0,
    nextReview: serverTimestamp(),
    createdAt: serverTimestamp(),
    // optional metadata
    page: typeof page === "number" ? page : null,
    bookId: bookId ?? null,
    userId: userId ?? null,
  };

  // If userId provided, store under their subcollection; otherwise use global "flashcards"
  const colRef = userId
    ? collection(db, "users", userId, "flashcards")
    : collection(db, "flashcards");

  await addDoc(colRef, flashcard);
  return flashcard;
}