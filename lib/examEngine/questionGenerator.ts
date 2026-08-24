// lib/examEngine/questionGenerator.ts
// Client-side caller for pages/api/exam-question-gen.ts. Requests generation
// lazily — only when an exam build needs more questions for a concept than
// are already cached — and caches results in IndexedDB keyed by
// bookId+conceptId+questionType+difficulty so re-running an exam on the same
// book never re-calls the AI for concepts already covered.

import type { DifficultyLevel, EngineQuestion, QuestionType } from "@/lib/examEngine/types";
import { linkQuestionToUnit } from "@/lib/canonical/store";

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
  /** Canonical page identity — threaded onto EngineQuestion.pageTruthKey. */
  pageTruthKey?: string;
  /** CanonicalThoughtUnit IDs this question was generated from. */
  sourceThoughtUnitIds?: string[];
  /** Knowledge Graph node IDs already resolved for this source page —
   *  TestLab-Reader progress integration provenance, stamped client-side
   *  the same way sourceThoughtUnitIds is below (the server doesn't know
   *  about the Knowledge Graph). */
  sourceKnowledgeNodeIds?: string[];
  /** The resolved documentId sourceKnowledgeNodeIds' nodes belong to —
   *  see EngineQuestion.sourceDocumentId. Stamped client-side alongside
   *  sourceKnowledgeNodeIds for the same reason. */
  sourceDocumentId?: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  count: number;
}

// P1 fix — this key used to omit examProfileId, so a DAT build and a Custom
// Exam build over the same book/concept/type/difficulty collided in the
// cache: whichever profile generated first "won," and every subsequent
// build under the OTHER profile silently got back cached EngineQuestions
// still stamped with the first profile's examProfileId. examBuilder.ts
// never re-stamps examProfileId on the questions getOrGenerateQuestions
// returns — it's only sent as a request param for the cache-miss path — so
// a cache hit under the wrong profile shipped a wrong examProfileId all
// the way to app/apex/results/page.tsx's profile-resolution logic. Scoping
// the cache key by profile closes this at the source; stale entries under
// the old 4-part key format simply age out (this cache is disposable and
// rebuildable, like every other cache in this module).
export function cacheKey(opts: Pick<GenerateQuestionsOptions, "examProfileId" | "bookId" | "conceptId" | "questionType" | "difficulty">): string {
  return `${opts.examProfileId}::${opts.bookId}::${opts.conceptId}::${opts.questionType}::${opts.difficulty}`;
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
        pageTruthKey: opts.pageTruthKey,
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
    const generated: EngineQuestion[] = Array.isArray(data?.questions)
      ? (data.questions as EngineQuestion[]).map((q) => ({
          ...q,
          sourceThoughtUnitIds: opts.sourceThoughtUnitIds?.length
            ? opts.sourceThoughtUnitIds
            : q.sourceThoughtUnitIds,
          sourceKnowledgeNodeIds: opts.sourceKnowledgeNodeIds?.length
            ? opts.sourceKnowledgeNodeIds
            : q.sourceKnowledgeNodeIds,
          sourceDocumentId: opts.sourceDocumentId ?? q.sourceDocumentId,
        }))
      : [];

    if (generated.length > 0) {
      const merged = [...cached, ...generated];
      await idbPutCached(key, merged);

      // X2 — make CanonicalThoughtUnit.questionIds real: every generated
      // question that survived the server's grounding/rejection gate gets
      // linked back to the unit(s) it was generated from. Best-effort and
      // fire-and-forget — a link failure never blocks returning questions
      // to the caller.
      for (const q of generated) {
        for (const unitId of q.sourceThoughtUnitIds ?? []) {
          linkQuestionToUnit(unitId, q.id).catch(() => {});
        }
      }

      return merged.slice(0, opts.count);
    }
  } catch (e) {
    console.error("[EXAM_ENGINE_QUESTIONGEN_FETCH_FAIL]", String(e));
  }

  return cached;
}
