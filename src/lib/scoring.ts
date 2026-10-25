import type { FormulaNode, ScoringRule, TimerState, VexOverrideTally } from './types';

/**
 * Mirrors server calculations for display only. The edge function / database
 * remains authoritative; clients must never persist this value as a score.
 */
export function evaluateFormula(node: FormulaNode | null | undefined, quantity: number): number {
  if (!node) return quantity;
  switch (node.op) {
    case 'value': return quantity;
    case 'const': return node.value;
    case 'add': return evaluateFormula(node.left, quantity) + evaluateFormula(node.right, quantity);
    case 'subtract': return evaluateFormula(node.left, quantity) - evaluateFormula(node.right, quantity);
    case 'multiply': return evaluateFormula(node.left, quantity) * evaluateFormula(node.right, quantity);
    case 'min': return Math.min(evaluateFormula(node.left, quantity), evaluateFormula(node.right, quantity));
    case 'max': return Math.max(evaluateFormula(node.left, quantity), evaluateFormula(node.right, quantity));
    case 'clamp': return Math.min(node.max, Math.max(node.min, evaluateFormula(node.value, quantity)));
  }
}

export function calculateRulePoints(rule: ScoringRule, quantity: number): number {
  if (!rule.allowNegative && quantity < 0) throw new Error('This rule cannot use a negative quantity.');
  if (quantity < rule.minQuantity || (rule.maxQuantity !== null && quantity > rule.maxQuantity)) {
    throw new Error('Quantity is outside this rule’s permitted range.');
  }
  const input = evaluateFormula(rule.formula, quantity);
  const raw = rule.scoringType === 'zero_point' ? 0 : input * rule.pointsPerUnit * rule.multiplier;
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

export function timerElapsedMs(timer: TimerState, now = Date.now()): number {
  if (timer.status !== 'running' || !timer.startedAt) return timer.elapsedBeforeMs;
  return Math.max(0, timer.elapsedBeforeMs + (now - new Date(timer.startedAt).getTime()));
}

export function timerDisplayMs(timer: TimerState, now = Date.now()): number {
  const elapsed = timerElapsedMs(timer, now);
  return timer.mode === 'countdown' ? Math.max(0, timer.durationMs - elapsed) : elapsed;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

/** Implements only the published numerical scoring table for Override v2.1. */
export function calculateVexOverride(tally: VexOverrideTally) {
  const red =
    tally.redAlliancePinHalves * 5 +
    (tally.quadrantYellowOwnedByRed + tally.midfieldYellowOwnedByRed) * 10 +
    tally.redRobotsInMidfield * 8 +
    (tally.autonomousWinner === 'red' ? 12 : tally.autonomousWinner === 'tie' ? 6 : 0);
  const blue =
    tally.blueAlliancePinHalves * 5 +
    (tally.quadrantYellowOwnedByBlue + tally.midfieldYellowOwnedByBlue) * 10 +
    tally.blueRobotsInMidfield * 8 +
    (tally.autonomousWinner === 'blue' ? 12 : tally.autonomousWinner === 'tie' ? 6 : 0);
  return { red, blue };
}
