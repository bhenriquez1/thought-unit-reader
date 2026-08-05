// lib/whiteboard/professorLessonPlanCache.ts
// IDB persistence for ProfessorLessonPlan, keyed by
// buildProfessorLessonCacheKey() (documentId + pageTruthKey +
// activeCanonicalUnitId + PLANNER_VERSION, per professorLessonPlan.ts) —
// fresh, page-specific teaching without repeatedly paying for identical
// generation. A PLANNER_VERSION bump makes old entries miss cleanly, same
// pattern as lib/canonical/surgeonAnnotationPlanStore.ts.

import type { ProfessorLessonPlan } from "./professorLessonPlan";

const DB_NAME    = "avrrio_professor_lessons_v1";
const STORE_NAME = "professor_lessons_v1";

export interface StoredProfessorLessonPlan {
  cacheKey: string;
  plan: ProfessorLessonPlan;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error("IDB blocked"));
  });
}

export async function saveProfessorLessonPlan(cacheKey: string, plan: ProfessorLessonPlan): Promise<void> {
  const db = await openDB();
  const record: StoredProfessorLessonPlan = { cacheKey, plan, createdAt: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function getProfessorLessonPlan(cacheKey: string): Promise<StoredProfessorLessonPlan | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(cacheKey);
    req.onsuccess = () => resolve((req.result as StoredProfessorLessonPlan) ?? null);
    req.onerror   = () => reject(req.error);
  });
}
