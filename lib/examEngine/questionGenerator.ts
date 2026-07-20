// lib/examEngine/questionGenerator.ts
// Client-side caller for pages/api/exam-question-gen.ts. Requests generation
// lazily — only when an exam build needs more questions for a concept than
// are already cached — and caches results in IndexedDB keyed by
// bookId+conceptId+questionType+difficulty so re-running an exam on the same
// book never re-calls the AI for concepts already covered.

import type { DifficultyLevel, EngineQuestion, QuestionType } from "@/lib/examEngine/types";

const IDB_DB_NAME = "avrrio_exam_engine_v1";
const IDB_STORE_NAME = "questionCache";

export interface GenerateQuestionsOptions {
  examProfileId: string;
  bookId: string;
  bookTitle?: string;
  conceptId: string;
  conceptText: string;
  topic?: string;
  section?: string;
  sourcePageNumber?: number;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  count: number;
}

function cacheKey(opts: Pick<GenerateQuestionsOptions, "bookId" | "conceptId" | "questionType" | "difficulty">): string {
  return `${opts.bookId}::${opts.conceptId}::${opts.questionType}::${opts.difficulty}`;
}

function openCacheIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IDB unavailable")); return; }
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IDB blocked"));
  });
}

async function idbGetCached(key: string): Promise<EngineQuestion[]> {
  try {
    const db = await openCacheIDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readonly");
      const req = tx.objectStore(IDB_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result?.questions ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function idbPutCached(key: string, questions: EngineQuestion[]): Promise<void> {
  try {
    const db = await openCacheIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      tx.objectStore(IDB_STORE_NAME).put({ key, questions, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[EXAM_ENGINE_CACHE_PUT_FAIL]", String(e));
  }
}

/** Returns at least `opts.count` cached questions for this concept/type/difficulty,
 *  generating only the shortfall via the AI question-gen API. */
export async function getOrGenerateQuestions(opts: GenerateQuestionsOptions): Promise<EngineQuestion[]> {
  const key = cacheKey(opts);
  const cached = await idbGetCached(key);

  if (cached.length >= opts.count) {
    return cached.slice(0, opts.count);
  }

  const need = opts.count - cached.length;
  try {
    const resp = await fetch("/api/exam-question-gen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examProfileId: opts.examProfileId,
        bookId: opts.bookId,
        bookTitle: opts.bookTitle,
        conceptId: opts.conceptId,
        conceptText: opts.conceptText,
        topic: opts.topic,
        section: opts.section,
        sourcePageNumber: opts.sourcePageNumber,
        questionType: opts.questionType,
        difficulty: opts.difficulty,
        count: need,
      }),
    });
    const data = await resp.json();
    // Surface server-reported errors (missing API key, OpenAI 4xx, timeout) so
    // the caller sees a meaningful message instead of an empty question pool.
    if (data.error && (!Array.isArray(data.questions) || data.questions.length === 0)) {
      throw new Error(data.error);
    }
    const generated: EngineQuestion[] = Array.isArray(data?.questions) ? data.questions : [];

    if (generated.length > 0) {
      const merged = [...cached, ...generated];
      await idbPutCached(key, merged);
      return merged.slice(0, opts.count);
    }
  } catch (e) {
    console.error("[EXAM_ENGINE_QUESTIONGEN_FETCH_FAIL]", String(e));
  }

  return cached;
}
