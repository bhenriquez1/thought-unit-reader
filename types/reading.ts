// types/reading.ts

export type ReadingStats = {
  wordsRead: number;
  timeElapsed: number;
  currentWPM: number;
};

// TEMP shim – make it permissive so existing code compiles
export type ThoughtUnit = {
  id?: string | number;
  text?: string;
  pageStart?: number;
  pageEnd?: number;
  [key: string]: any;
};