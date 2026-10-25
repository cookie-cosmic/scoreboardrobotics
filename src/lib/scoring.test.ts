import { describe, expect, it } from 'vitest';
import { calculateRulePoints, calculateVexOverride, formatClock, timerDisplayMs } from './scoring';
import type { ScoringRule, TimerState } from './types';

const baseRule: ScoringRule = {
  id: 'r', competitionId: 'c', version: 1, ruleKey: 'objects', displayName: 'Objects', description: null, scoringType: 'counter', pointsPerUnit: 5, unitLabel: 'object', quantityIncrement: 1, minQuantity: 0, maxQuantity: 5, allowNegative: false, appliesTo: 'alliance', allowedPeriods: ['any'], multiplier: 1, repeatable: true, confirmationRequired: false, buttonLabel: '+5', buttonColor: '#000000', displayOrder: 1, isActive: true,
};

describe('scoring calculations', () => {
  it('calculates and rounds scoring deterministically', () => {
    expect(calculateRulePoints({ ...baseRule, pointsPerUnit: 1.235 }, 2)).toBe(2.47);
  });
  it('rejects values outside configured caps', () => {
    expect(() => calculateRulePoints(baseRule, 6)).toThrow(/permitted range/);
    expect(() => calculateRulePoints(baseRule, -1)).toThrow(/cannot use a negative/);
  });
  it('evaluates only supported formula AST nodes', () => {
    expect(calculateRulePoints({ ...baseRule, formula: { op: 'multiply', left: { op: 'value' }, right: { op: 'const', value: 3 } } }, 2)).toBe(30);
  });
  it('uses persisted start time rather than a browser interval for timer display', () => {
    const timer: TimerState = { status: 'running', mode: 'countdown', durationMs: 120000, elapsedBeforeMs: 5000, startedAt: new Date(1_000_000).toISOString(), version: 1, activePeriodKey: 'match' };
    expect(timerDisplayMs(timer, 1_010_000)).toBe(105000);
    expect(formatClock(105000)).toBe('1:45');
  });
  it('implements published Override numerical values', () => {
    expect(calculateVexOverride({ redAlliancePinHalves: 3, blueAlliancePinHalves: 1, quadrantYellowOwnedByRed: 2, quadrantYellowOwnedByBlue: 0, midfieldYellowOwnedByRed: 0, midfieldYellowOwnedByBlue: 1, redRobotsInMidfield: 2, blueRobotsInMidfield: 1, autonomousWinner: 'red' })).toEqual({ red: 63, blue: 23 });
  });
});
