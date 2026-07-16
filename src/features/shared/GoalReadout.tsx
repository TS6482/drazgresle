import { evaluateLeftoverGoal } from '../../engine/goals';
import { formatKc } from '../../engine/money';
import styles from './GoalReadout.module.css';

interface GoalReadoutProps {
  /** True leftover this month: income − spent − saved (signed halere). */
  leftoverHalere: number;
  /** The monthly leftover target the goal is set to (halere). */
  targetHalere: number;
}

/**
 * A compact iOS-style status pill comparing the month's true leftover against
 * the leftover goal: green (with a leading ✓) when on or over target, red when
 * short. Callers render it only when a goal is set (and, for the month view,
 * only when there is income to measure against).
 */
export function GoalReadout({ leftoverHalere, targetHalere }: GoalReadoutProps) {
  const { status, diffHalere } = evaluateLeftoverGoal(leftoverHalere, targetHalere);
  const positive = status === 'over' || status === 'met';

  const text =
    status === 'over'
      ? `On track — ${formatKc(diffHalere)} over your ${formatKc(targetHalere)} goal`
      : status === 'met'
        ? `Met your ${formatKc(targetHalere)} goal`
        : `${formatKc(-diffHalere)} under your ${formatKc(targetHalere)} goal`;

  return (
    <p className={`${styles.pill} ${positive ? styles.positive : styles.negative}`}>
      {positive && <span aria-hidden="true">✓ </span>}
      {text}
    </p>
  );
}
