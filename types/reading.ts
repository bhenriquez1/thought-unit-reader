// /types/reading.ts
export interface ThoughtUnit {
  text: string; // canonical shape
}

export interface ReadingStats {
  wordsRead: number;
  timeElapsed: number;   // seconds
  currentWPM: number;
}