// lib/elena/dailyLimit.ts
// Pure logic for parental daily reading-time limits — P1 fix ("Avrrio
// Master Audit," roadmap item: Elena parental controls). ChildProgress's
// pre-existing totalMinutes is a LIFETIME cumulative total and cannot
// answer "how many minutes has this child read today" — checking a daily
// limit against a lifetime total would incorrectly and immediately block
// any child who has ever read past the limit, on their very first session.
// todayMinutes/todayDate (lib/elena/types.ts's ChildProgress) are a real
// per-day counter that resets whenever the stored date isn't today,
// mirroring the streak date-diff pattern ElenaChildWorkspace.tsx's
// awardStar() already uses.

import type { ChildProgress } from "./types";

/** Pure — today's minutes, rolled over to 0 if the stored date isn't `today`. */
export function rollDailyMinutes(
  progress: Pick<ChildProgress, "todayMinutes" | "todayDate">,
  today: string,
): { todayMinutes: number; todayDate: string } {
  if (progress.todayDate === today) {
    return { todayMinutes: progress.todayMinutes ?? 0, todayDate: today };
  }
  return { todayMinutes: 0, todayDate: today };
}

/** Pure — adds elapsedMinutes to both the lifetime total and the
 *  (rolled-over) daily counter. Does not touch lastActiveAt/updatedAt —
 *  callers stamp those themselves, same as every other progress writer. */
export function addDailyMinutes(
  progress: ChildProgress,
  elapsedMinutes: number,
  today: string,
): ChildProgress {
  const rolled = rollDailyMinutes(progress, today);
  return {
    ...progress,
    totalMinutes: progress.totalMinutes + elapsedMinutes,
    todayMinutes: rolled.todayMinutes + elapsedMinutes,
    todayDate:    today,
  };
}

/** Pure — true once today's rolled-over minutes reach the parent-set limit.
 *  A null/zero/negative limit means "no limit" and never blocks. */
export function isDailyLimitReached(
  progress: Pick<ChildProgress, "todayMinutes" | "todayDate"> | null,
  limitMinutes: number | null,
  today: string,
): boolean {
  if (limitMinutes === null || limitMinutes <= 0) return false;
  if (!progress) return false;
  return rollDailyMinutes(progress, today).todayMinutes >= limitMinutes;
}
