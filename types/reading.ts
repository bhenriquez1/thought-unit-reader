// types/reading.ts
// Keep these loose enough to match your current usage.
// A single thought unit is an array of token strings (words/chunks).
export type ThoughtUnit = string[];

// Basic reading stats used by ProgressiveView/UI.
export type ReadingStats = {
  totalUnits: number;        // total count of units in the current text
  completedUnits: number;    // how many units have been read/marked
  percentComplete: number;   // 0–100
};