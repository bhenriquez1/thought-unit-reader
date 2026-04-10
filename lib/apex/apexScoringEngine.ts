// lib/apex/apexScoringEngine.ts
// DAT Apex Scoring & Projection Engine

import type {
  ApexSection,
  DatProjection,
  MistakeRecord,
  PatternReadiness,
  PdrmAnalysis,
  PracticeScore,
  StudySession,
  TrapRecord,
  UserPattern,
} from "@/lib/apex/datApexTypes";

// ---------------------------------------------------------------------------
// Pattern Readiness
// ---------------------------------------------------------------------------

export function updatePatternReadiness(
  pattern: UserPattern,
  recentAttempts: PdrmAnalysis[],
  recentTimes: number[],
): PatternReadiness {
  const relevant = recentAttempts.filter(
    (a) => a.pattern.id === pattern.id || a.pattern.label === pattern.name,
  );

  const recognition = relevant.length
    ? Math.min(100, (relevant.filter((a) => a.pattern.confidence > 0.7).length / relevant.length) * 100)
    : pattern.timesSeen > 0
      ? Math.min(100, (pattern.timesCorrect / pattern.timesSeen) * 100)
      : 0;

  const decisionAccuracy = pattern.timesSeen > 0
    ? Math.min(100, (pattern.timesCorrect / pattern.timesSeen) * 100)
    : 0;

  const trapResistance = pattern.timesSeen > 0
    ? Math.max(0, 100 - (pattern.timesMissed / pattern.timesSeen) * 150)
    : 50;

  const avgMs = recentTimes.length
    ? recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length
    : pattern.avgTimeSeconds || 60;
  // Speed index: 100 = answer in ≤40s, 0 = answer in ≥120s
  const speed = Math.max(0, Math.min(100, ((120 - avgMs) / 80) * 100));

  const readiness = Math.round(
    0.35 * recognition +
    0.30 * decisionAccuracy +
    0.20 * trapResistance +
    0.15 * speed,
  );

  return {
    patternId: pattern.id,
    section: pattern.section,
    readiness: Math.max(0, Math.min(100, readiness)),
    recognition: Math.round(recognition),
    decisionAccuracy: Math.round(decisionAccuracy),
    trapResistance: Math.max(0, Math.round(trapResistance)),
    speed: Math.round(speed),
    lastSeenAt: pattern.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Section Projection
// ---------------------------------------------------------------------------

/** Map DAT scaled score (200–600) ↔ percent correct (0–100) */
function pctToScaled(pct: number): number {
  // Simplified linear: 0% ≈ 200, 100% ≈ 600; typical 60% ≈ ~400 (passing midpoint)
  return Math.round(200 + pct * 4);
}

function sectionProjection(
  section: ApexSection,
  sessions: StudySession[],
  scores: PracticeScore[],
  patterns: PatternReadiness[],
  traps: TrapRecord[],
): number {
  const sectionScores = scores.filter((s) => s.section === section);
  const sectionSessions = sessions.filter(
    (s) => s.section === section || s.section === "mixed",
  );
  const sectionPatterns = patterns.filter((p) => p.section === section);
  const sectionTraps = traps.filter((t) => t.section === section);

  // Recency-weighted timed accuracy (sessions in last 14 days weighted 2x)
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recentTimedScores = sectionScores.filter(
    (s) => (s.mode === "section_test" || s.mode === "full_sim") && new Date(s.createdAt).getTime() > cutoff,
  );
  const timedAcc = recentTimedScores.length
    ? recentTimedScores.reduce((sum, s) => sum + s.percent, 0) / recentTimedScores.length
    : sectionScores.length
      ? sectionScores.reduce((sum, s) => sum + s.percent, 0) / sectionScores.length
      : 45;

  // Mixed set accuracy (all modes)
  const mixedAcc = sectionScores.length
    ? sectionScores.reduce((sum, s) => sum + s.percent, 0) / sectionScores.length
    : timedAcc;

  // Pattern readiness average
  const patReadiness = sectionPatterns.length
    ? sectionPatterns.reduce((sum, p) => sum + p.readiness, 0) / sectionPatterns.length
    : 40;

  // Trap resistance (penalise high-severity repeated traps)
  const highSeverityTraps = sectionTraps.filter(
    (t) => t.severity === "high" && t.timesTriggered > 1,
  ).length;
  const trapResistance = Math.max(
    0,
    patReadiness - highSeverityTraps * 8,
  );

  // Speed index from recent sessions
  const timedSessions = sectionSessions.filter((s) => s.durationSeconds > 0 && s.total > 0);
  const avgSecsPerQ = timedSessions.length
    ? timedSessions.reduce(
        (sum, s) => sum + s.durationSeconds / Math.max(1, s.total),
        0,
      ) / timedSessions.length
    : 70;
  const speedIndex = Math.max(0, Math.min(100, ((120 - avgSecsPerQ) / 80) * 100));

  const pct =
    0.45 * timedAcc +
    0.20 * mixedAcc +
    0.15 * patReadiness +
    0.10 * trapResistance +
    0.10 * speedIndex;

  return pctToScaled(Math.min(100, Math.max(0, pct)));
}

export function buildDatProjection(
  sessions: StudySession[],
  scores: PracticeScore[],
  patterns: PatternReadiness[],
  traps: TrapRecord[],
): DatProjection {
  const sectionIds: ApexSection[] = ["bio", "gc", "orgo", "pat", "rc", "qr"];
  const sectionProjected = {} as Record<ApexSection, number>;
  for (const s of sectionIds) {
    sectionProjected[s] = sectionProjection(s, sessions, scores, patterns, traps);
  }
  const totalProjected = Math.round(
    sectionIds.reduce((sum, s) => sum + sectionProjected[s], 0) / sectionIds.length,
  );

  const seriousSessions = sessions.filter(
    (s) => s.mode === "section_test" || s.mode === "full_sim" || s.durationSeconds > 900,
  ).length;

  const confidence: DatProjection["confidence"] =
    seriousSessions < 5 ? "low" : seriousSessions < 12 ? "medium" : "high";

  return {
    totalProjected,
    confidence,
    sectionProjected,
    basedOnSessions: sessions.length,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// AI Insights
// ---------------------------------------------------------------------------

export function buildAiInsights(
  mistakes: MistakeRecord[],
  patterns: PatternReadiness[],
  projection: DatProjection | null,
): string[] {
  const insights: string[] = [];

  if (!projection || !mistakes.length) {
    insights.push("Complete a practice session to unlock personalised insights.");
    insights.push("Start with Pattern Drill mode to build recognision speed.");
    return insights;
  }

  // Identify weakest section
  const sectionIds: ApexSection[] = ["bio", "gc", "orgo", "pat", "rc", "qr"];
  const sectionLabel: Record<ApexSection, string> = {
    bio: "Biology",
    gc: "General Chemistry",
    orgo: "Organic Chemistry",
    pat: "PAT",
    rc: "Reading Comprehension",
    qr: "Quantitative Reasoning",
  };
  const weakest = sectionIds.reduce((a, b) =>
    projection.sectionProjected[a] < projection.sectionProjected[b] ? a : b,
  );
  insights.push(
    `${sectionLabel[weakest]} is your lowest-projected section (${projection.sectionProjected[weakest]}). Focus here for the biggest score gain.`,
  );

  // Trap patterns
  const trapCounts: Record<string, number> = {};
  for (const m of mistakes) {
    const key = m.pdrm.miss || m.reasonMissed;
    trapCounts[key] = (trapCounts[key] || 0) + 1;
  }
  const topTrap = Object.entries(trapCounts).sort((a, b) => b[1] - a[1])[0];
  if (topTrap && topTrap[1] >= 2) {
    insights.push(
      `Your most repeated error: "${topTrap[0]}" — triggered ${topTrap[1]} times. Add Trap Training for this pattern.`,
    );
  }

  // Identify unstable patterns (readiness 30–60)
  const unstable = patterns
    .filter((p) => p.readiness >= 30 && p.readiness < 60)
    .sort((a, b) => b.readiness - a.readiness)
    .slice(0, 2);
  if (unstable.length) {
    insights.push(
      `Unstable patterns need drilling: readiness at ${unstable[0].readiness}% — one wrong signal flips the outcome.`,
    );
  }

  // Decision accuracy vs recognition gap
  const lowDecision = patterns.filter(
    (p) => p.recognition > 70 && p.decisionAccuracy < p.recognition - 20,
  );
  if (lowDecision.length) {
    insights.push(
      `You recognise patterns but misapply the rule — decision accuracy lags recognition by ${Math.round(
        lowDecision[0].recognition - lowDecision[0].decisionAccuracy,
      )}% on key concepts. Practice "Decision Mode".`,
    );
  }

  // Speed signal
  const slowPatterns = patterns.filter((p) => p.speed < 40);
  if (slowPatterns.length >= 3) {
    insights.push(
      `${slowPatterns.length} patterns show slow response times. Trigger Speed Mode to convert understanding into reflex.`,
    );
  }

  return insights.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Next Action Recommendation
// ---------------------------------------------------------------------------

export function recommendNextAction(
  projection: DatProjection | null,
  patterns: PatternReadiness[],
  traps: TrapRecord[],
): { section: string; mode: string; targetPatterns: string[]; reason: string } {
  if (!projection) {
    return {
      section: "mixed",
      mode: "quick",
      targetPatterns: [],
      reason: "Start with a quick mixed session to establish your baseline.",
    };
  }

  const sectionIds: ApexSection[] = ["bio", "gc", "orgo", "pat", "rc", "qr"];
  const weakest = sectionIds.reduce((a, b) =>
    projection.sectionProjected[a] < projection.sectionProjected[b] ? a : b,
  );

  const repeatedTraps = traps.filter(
    (t) => t.timesTriggered > 2 && t.severity !== "low",
  );
  if (repeatedTraps.length) {
    return {
      section: repeatedTraps[0].section,
      mode: "pattern_drill",
      targetPatterns: repeatedTraps.map((t) => t.trapType).slice(0, 3),
      reason: `You've hit the same trap ${repeatedTraps[0].timesTriggered} times. Run Trap Training before more practice.`,
    };
  }

  const unstablePatterns = patterns
    .filter((p) => p.section === weakest && p.readiness < 60)
    .sort((a, b) => a.readiness - b.readiness)
    .slice(0, 3);

  if (unstablePatterns.length) {
    return {
      section: weakest,
      mode: "pattern_drill",
      targetPatterns: unstablePatterns.map((p) => p.patternId),
      reason: `${unstablePatterns.length} patterns in your weakest section are unstable. Drill before mixed practice.`,
    };
  }

  return {
    section: weakest,
    mode: "section_test",
    targetPatterns: [],
    reason: `Timed section test in ${weakest.toUpperCase()} will best improve your projection score this session.`,
  };
}

// ---------------------------------------------------------------------------
// Adaptive difficulty
// ---------------------------------------------------------------------------

export function computeNextDifficulty(
  currentDifficulty: number,
  recentAccuracy: number,
  recentAvgTimeSeconds: number,
  trapResistance: number,
  datPlus: boolean,
): number {
  let d = currentDifficulty;
  if (recentAccuracy > 80) d += 2;
  if (recentAvgTimeSeconds < 40) d += 1;
  if (trapResistance > 75) d += 1;
  if (recentAccuracy < 50) d -= 1;
  if (datPlus) d += 2;
  return Math.max(1, Math.min(10, d));
}
