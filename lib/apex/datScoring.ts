// DAT Scoring Utilities
// Converts percentage scores to NEW DAT scaled scores (200-600)
// Updated March 2025: ADA transitioned to 3-digit scoring system

/**
 * Converts a percentage score to NEW DAT scaled score
 * DAT scores now range from 200-600, with 400 being the average (50th percentile)
 * 
 * Approximate conversion based on NEW DAT scoring (March 2025):
 * - 99th percentile: 550-600
 * - 90th percentile: 500-549
 * - 75th percentile: 450-499
 * - 50th percentile: 400 (average)
 * - 25th percentile: 350-399
 * - 10th percentile: 300-349
 * - 1st percentile: 200-299
 */
export function percentageToDATScore(percentage: number): number {
  // Clamp percentage between 0 and 100
  const clampedPercentage = Math.max(0, Math.min(100, percentage));
  
  // Convert using a sigmoid-like curve that matches NEW DAT distribution
  let datScore: number;
  
  if (clampedPercentage >= 95) {
    // 95-100% -> 550-600
    datScore = 550 + ((clampedPercentage - 95) / 5) * 50;
  } else if (clampedPercentage >= 85) {
    // 85-95% -> 500-550
    datScore = 500 + ((clampedPercentage - 85) / 10) * 50;
  } else if (clampedPercentage >= 70) {
    // 70-85% -> 450-500
    datScore = 450 + ((clampedPercentage - 70) / 15) * 50;
  } else if (clampedPercentage >= 50) {
    // 50-70% -> 400-450
    datScore = 400 + ((clampedPercentage - 50) / 20) * 50;
  } else if (clampedPercentage >= 30) {
    // 30-50% -> 350-400
    datScore = 350 + ((clampedPercentage - 30) / 20) * 50;
  } else if (clampedPercentage >= 15) {
    // 15-30% -> 300-350
    datScore = 300 + ((clampedPercentage - 15) / 15) * 50;
  } else {
    // 0-15% -> 200-300
    datScore = 200 + (clampedPercentage / 15) * 100;
  }
  
  // Round to nearest whole number and clamp to valid range
  return Math.max(200, Math.min(600, Math.round(datScore)));
}

/**
 * Converts NEW DAT score back to approximate percentage
 */
export function datScoreToPercentage(datScore: number): number {
  // Clamp DAT score between 200 and 600
  const clampedScore = Math.max(200, Math.min(600, datScore));
  
  let percentage: number;
  
  if (clampedScore >= 550) {
    // 550-600 -> 95-100%
    percentage = 95 + ((clampedScore - 550) / 50) * 5;
  } else if (clampedScore >= 500) {
    // 500-550 -> 85-95%
    percentage = 85 + ((clampedScore - 500) / 50) * 10;
  } else if (clampedScore >= 450) {
    // 450-500 -> 70-85%
    percentage = 70 + ((clampedScore - 450) / 50) * 15;
  } else if (clampedScore >= 400) {
    // 400-450 -> 50-70%
    percentage = 50 + ((clampedScore - 400) / 50) * 20;
  } else if (clampedScore >= 350) {
    // 350-400 -> 30-50%
    percentage = 30 + ((clampedScore - 350) / 50) * 20;
  } else if (clampedScore >= 300) {
    // 300-350 -> 15-30%
    percentage = 15 + ((clampedScore - 300) / 50) * 15;
  } else {
    // 200-300 -> 0-15%
    percentage = ((clampedScore - 200) / 100) * 15;
  }
  
  return Math.max(0, Math.min(100, Math.round(percentage * 10) / 10));
}

/**
 * Gets the percentile rank for a NEW DAT score
 */
export function getDATPercentile(datScore: number): number {
  const clampedScore = Math.max(200, Math.min(600, datScore));
  
  // Approximate percentile mapping for NEW scoring
  if (clampedScore >= 550) return 99;
  if (clampedScore >= 500) return 90;
  if (clampedScore >= 450) return 75;
  if (clampedScore >= 400) return 50;
  if (clampedScore >= 350) return 25;
  if (clampedScore >= 300) return 10;
  return 1;
}

/**
 * Gets a descriptive label for a NEW DAT score
 */
export function getDATScoreLabel(datScore: number): string {
  const clampedScore = Math.max(200, Math.min(600, datScore));
  
  if (clampedScore >= 550) return 'Excellent';
  if (clampedScore >= 500) return 'Very Good';
  if (clampedScore >= 450) return 'Good';
  if (clampedScore >= 400) return 'Average';
  if (clampedScore >= 350) return 'Below Average';
  if (clampedScore >= 300) return 'Poor';
  return 'Very Poor';
}

/**
 * Formats a NEW DAT score for display (whole numbers)
 */
export function formatDATScore(score: number): string {
  return Math.round(score).toString();
}

/**
 * Gets color class for NEW DAT score display
 */
export function getDATScoreColor(datScore: number): string {
  const clampedScore = Math.max(200, Math.min(600, datScore));
  
  if (clampedScore >= 550) return 'text-green-400';
  if (clampedScore >= 500) return 'text-blue-400';
  if (clampedScore >= 450) return 'text-cyan-400';
  if (clampedScore >= 400) return 'text-yellow-400';
  if (clampedScore >= 350) return 'text-orange-400';
  return 'text-red-400';
}

/**
 * Sample NEW DAT scores for testing/demo purposes
 */
export const SAMPLE_DAT_SCORES = {
  excellent: 575,
  veryGood: 525,
  good: 475,
  average: 400,
  belowAverage: 375,
  poor: 325,
  veryPoor: 250
};
