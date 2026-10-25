export type CompetitionStatus = 'draft' | 'active' | 'completed' | 'archived';
export type MemberRole = 'owner' | 'administrator' | 'scorekeeper' | 'viewer';
export type MatchStatus = 'scheduled' | 'ready' | 'running' | 'paused' | 'finalized' | 'void';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'complete';
export type ScoringType =
  | 'counter'
  | 'fixed'
  | 'numeric'
  | 'boolean'
  | 'penalty'
  | 'timed'
  | 'elapsed'
  | 'distance'
  | 'threshold'
  | 'placement'
  | 'milestone'
  | 'combination'
  | 'zero_point';

export interface CompetitionSummary {
  id: string;
  name: string;
  description: string | null;
  status: CompetitionStatus;
  gameType: 'custom' | 'vex_style' | 'vex_override_2026';
  timezone: string;
  updatedAt: string;
  createdAt: string;
  ownerName?: string;
  teamCount?: number;
  matchCount?: number;
}

export interface Team {
  id: string;
  competitionId: string;
  number: string;
  name: string;
  color: string;
  alliance: 'red' | 'blue' | 'none' | null;
  archivedAt?: string | null;
}

export interface ScoringRule {
  id: string;
  competitionId: string;
  version: number;
  ruleKey: string;
  displayName: string;
  description: string | null;
  scoringType: ScoringType;
  pointsPerUnit: number;
  unitLabel: string;
  quantityIncrement: number;
  minQuantity: number;
  maxQuantity: number | null;
  allowNegative: boolean;
  appliesTo: 'team' | 'alliance' | 'match';
  allowedPeriods: string[];
  multiplier: number;
  repeatable: boolean;
  confirmationRequired: boolean;
  buttonLabel: string;
  buttonColor: string;
  displayOrder: number;
  isActive: boolean;
  formula?: FormulaNode | null;
}

export type FormulaNode =
  | { op: 'value' }
  | { op: 'const'; value: number }
  | { op: 'add' | 'subtract' | 'multiply' | 'min' | 'max'; left: FormulaNode; right: FormulaNode }
  | { op: 'clamp'; value: FormulaNode; min: number; max: number };

export interface ScoreEvent {
  id: string;
  matchId: string;
  competitionId: string;
  teamId: string | null;
  alliance: 'red' | 'blue' | null;
  ruleId: string | null;
  eventType: 'score' | 'correction' | 'undo' | 'system';
  quantity: number;
  pointsAwarded: number;
  periodKey: string | null;
  reason: string | null;
  actorLabel: string;
  occurredAt: string;
  reversedAt?: string | null;
  revisionOf?: string | null;
}

export interface MatchParticipant {
  id: string;
  teamId: string;
  alliance: 'red' | 'blue' | null;
  station: number | null;
  team?: Team;
}

export interface TimerState {
  status: TimerStatus;
  mode: 'countdown' | 'countup';
  durationMs: number;
  elapsedBeforeMs: number;
  startedAt: string | null;
  version: number;
  activePeriodKey: string;
}

export interface Match {
  id: string;
  competitionId: string;
  number: string;
  name: string;
  status: MatchStatus;
  scheduledAt: string | null;
  participants: MatchParticipant[];
  timer: TimerState;
  redScore: number;
  blueScore: number;
  events: ScoreEvent[];
}

export interface VexOverrideTally {
  redAlliancePinHalves: number;
  blueAlliancePinHalves: number;
  quadrantYellowOwnedByRed: number;
  quadrantYellowOwnedByBlue: number;
  midfieldYellowOwnedByRed: number;
  midfieldYellowOwnedByBlue: number;
  redRobotsInMidfield: number;
  blueRobotsInMidfield: number;
  autonomousWinner: 'red' | 'blue' | 'tie' | 'none';
}

export interface ActionRequest {
  action: 'score' | 'undo' | 'timer' | 'finalize' | 'correction';
  competitionId: string;
  matchId: string;
  idempotencyKey: string;
  expectedVersion?: number;
  payload: Record<string, unknown>;
}

export interface ActionResult {
  match: Match;
  event?: ScoreEvent;
  idempotent?: boolean;
}
