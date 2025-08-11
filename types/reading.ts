// types/reading.ts

// keep your existing ThoughtUnit (and other) exports as-is above/below

export type ReadingStats = {
  /** total words consumed so far */
  wordsRead: number;

  /** elapsed reading time (seconds is fine) */
  timeElapsed: number;

  /** current words-per-minute */
  currentWPM: number;
};