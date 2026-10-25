import { z } from 'zod';

export const competitionSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters.').max(100),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  gameType: z.enum(['custom', 'vex_style', 'vex_override_2026']),
  timezone: z.string().min(1),
});

export const ruleSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  scoringType: z.enum(['counter', 'fixed', 'numeric', 'boolean', 'penalty', 'timed', 'elapsed', 'distance', 'threshold', 'placement', 'milestone', 'combination', 'zero_point']),
  pointsPerUnit: z.coerce.number().finite().min(-100000).max(100000),
  quantityIncrement: z.coerce.number().finite().positive().max(100000),
  minQuantity: z.coerce.number().finite().min(-100000).max(100000),
  maxQuantity: z.coerce.number().finite().nullable(),
  allowNegative: z.boolean(),
  confirmationRequired: z.boolean(),
  buttonLabel: z.string().trim().min(1).max(30),
  buttonColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a six-digit color.'),
}).superRefine((value, context) => {
  if (value.maxQuantity !== null && value.maxQuantity < value.minQuantity) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['maxQuantity'], message: 'Maximum must be at least the minimum.' });
  }
  if (!value.allowNegative && value.minQuantity < 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['minQuantity'], message: 'Negative quantities are disabled.' });
  }
});

export const scoreActionSchema = z.object({
  ruleId: z.string().uuid(),
  quantity: z.number().finite().min(-100000).max(100000),
  teamId: z.string().uuid().nullable().optional(),
  alliance: z.enum(['red', 'blue']).nullable().optional(),
  periodKey: z.string().max(60).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const timerActionSchema = z.object({
  command: z.enum(['start', 'pause', 'resume', 'stop', 'reset', 'next_period']),
  expectedVersion: z.number().int().nonnegative(),
});
