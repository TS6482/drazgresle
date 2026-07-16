// Household goal evaluation. Pure — no React, no I/O. All amounts are signed
// integer halere. v1 has a single goal type (the monthly leftover target),
// modeled so more can be added later without reshaping callers.

/** Where the month sits against a leftover target. */
export type LeftoverGoalStatus = 'over' | 'met' | 'under';

export interface LeftoverGoalResult {
  targetHalere: number;
  leftoverHalere: number;
  /** leftover − target, signed: positive beats the goal, negative falls short. */
  diffHalere: number;
  status: LeftoverGoalStatus;
}

/**
 * Compare a month's true leftover (income − spent − saved) against a target:
 * `over` when leftover exceeds the target, `under` when it falls short, `met`
 * when they are exactly equal.
 */
export function evaluateLeftoverGoal(
  leftoverHalere: number,
  targetHalere: number,
): LeftoverGoalResult {
  const diffHalere = leftoverHalere - targetHalere;
  const status: LeftoverGoalStatus =
    diffHalere > 0 ? 'over' : diffHalere < 0 ? 'under' : 'met';
  return { targetHalere, leftoverHalere, diffHalere, status };
}
