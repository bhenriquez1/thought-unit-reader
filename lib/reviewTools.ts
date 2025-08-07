// lib/reviewTools.ts
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  Timestamp
} from "firebase/firestore";

/**
 * Returns all flashcards due for review today for a given user.
 */
export async function startReviewSession(userId: string) {
  const today = new Date().toISOString();

  const q = query(
    collection(db, "users", userId, "flashcards"),
    where("dueDate", "<=", today)
  );

  const snapshot = await getDocs(q);
  const dueCards = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return dueCards;
}

/**
 * Grades a flashcard and updates its next due date based on simple review logic.
 */
export async function autoGradeFlashcard(
  userId: string,
  cardId: string,
  front: string,
  back: string
) {
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + 2); // Simple 2-day interval

  const ref = doc(db, "users", userId, "flashcards", cardId);
  await updateDoc(ref, {
    dueDate: nextReviewDate.toISOString(),
    lastReviewed: Timestamp.now()
  });
}