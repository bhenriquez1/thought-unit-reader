// lib/aiReview.ts
export type ReviewCard = {
  id?: string;
  front: string;
  back?: string;
  reviewCount?: number;
  ease?: number;
  intervalDays?: number;
  due?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

async function getDB() {
  try {
    const mod = await import("./firebase").catch(() => null as any);
    if (mod?.db) return mod.db;
    const { getApps, getApp } = await import("firebase/app");
    if (getApps().length === 0) return null;
    const { getFirestore } = await import("firebase/firestore");
    return getFirestore(getApp());
  } catch {
    return null;
  }
}

export async function startReviewSession(userId?: string): Promise<{
  cards: ReviewCard[];
  startedAt: number;
}> {
  const db = await getDB();
  if (!db) return { cards: [], startedAt: Date.now() };

  const { collection, getDocs, orderBy, limit, query } = await import("firebase/firestore");
  const base = collection(db, "flashcards");
  const q = query(base, orderBy("createdAt", "asc"), limit(20));
  const snap = await getDocs(q);

  const cards: ReviewCard[] = snap.docs.map((d) => {
    const data: any = d.data();
    return {
      id: d.id,
      front: data.question ?? "",
      back: data.answer ?? "",
      reviewCount: data.reviewCount ?? 0,
      ease: data.ease ?? 2.5,
      intervalDays: data.intervalDays ?? 1,
      due: (data.due && typeof data.due.toMillis === "function")
        ? data.due.toMillis()
        : data.due ?? Date.now(),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  });

  return { cards, startedAt: Date.now() };
}

export async function autoGradeFlashcard(text: string): Promise<{
  grade: "easy" | "good" | "hard";
  intervalDays: number;
}> {
  const len = (text || "").trim().length;
  const grade = len > 160 ? "hard" : len > 80 ? "good" : "easy";
  const intervalDays = grade === "easy" ? 4 : grade === "good" ? 2 : 1;
  return { grade, intervalDays };
}

export default {};