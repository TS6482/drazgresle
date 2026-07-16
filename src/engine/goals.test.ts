import { describe, expect, it } from 'vitest';
import { evaluateLeftoverGoal } from './goals';

describe('evaluateLeftoverGoal', () => {
  it('is "over" when leftover beats the target', () => {
    const result = evaluateLeftoverGoal(2_500_000, 2_000_000);
    expect(result.status).toBe('over');
    expect(result.diffHalere).toBe(500_000);
    expect(result.targetHalere).toBe(2_000_000);
    expect(result.leftoverHalere).toBe(2_500_000);
  });

  it('is "met" when leftover equals the target exactly', () => {
    const result = evaluateLeftoverGoal(2_000_000, 2_000_000);
    expect(result.status).toBe('met');
    expect(result.diffHalere).toBe(0);
  });

  it('is "under" when leftover falls short of the target', () => {
    const result = evaluateLeftoverGoal(1_500_000, 2_000_000);
    expect(result.status).toBe('under');
    expect(result.diffHalere).toBe(-500_000);
  });

  it('is "under" (diff more negative than the target) when leftover is negative', () => {
    const result = evaluateLeftoverGoal(-300_000, 2_000_000);
    expect(result.status).toBe('under');
    expect(result.diffHalere).toBe(-2_300_000);
  });

  it('treats a zero target as met only at exactly zero leftover', () => {
    expect(evaluateLeftoverGoal(0, 0).status).toBe('met');
    expect(evaluateLeftoverGoal(1, 0).status).toBe('over');
    expect(evaluateLeftoverGoal(-1, 0).status).toBe('under');
  });
});
