const STORAGE_KEY = "thought-unit-progress-v1";

export type ProgressStep = "read" | "speech" | "explained" | "quiz" | "mastered";
type ProgressMap = Record<string, ProgressStep[]>;

function unitKey(bookId: string, pageNum: number, unitId: string) {
  return `${bookId}:${pageNum}:${unitId}`;
}

function load(): ProgressMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}

function save(map: ProgressMap) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

export function markProgress(bookId: string, pageNum: number, unitId: string, step: ProgressStep) {
  const map = load();
  const key = unitKey(bookId, pageNum, unitId);
  const steps = new Set(map[key] ?? []);
  steps.add(step);
  map[key] = [...steps];
  save(map);
}

export function getProgress(bookId: string, pageNum: number, unitId: string): Set<ProgressStep> {
  const map = load();
  return new Set((map[unitKey(bookId, pageNum, unitId)] ?? []) as ProgressStep[]);
}

export function getPageProgress(bookId: string, pageNum: number, unitIds: string[]): Map<string, Set<ProgressStep>> {
  const map = load();
  const result = new Map<string, Set<ProgressStep>>();
  for (const id of unitIds) {
    result.set(id, new Set((map[unitKey(bookId, pageNum, id)] ?? []) as ProgressStep[]));
  }
  return result;
}
