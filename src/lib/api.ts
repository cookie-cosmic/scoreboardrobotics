import { z } from 'zod';
import { competitionSchema } from './schemas';
import { supabase } from './supabase';
import type { ActionRequest, ActionResult, CompetitionSummary, Match, ScoringRule, Team } from './types';

function client() {
  if (!supabase) throw new Error('Connect Supabase before using live data.');
  return supabase;
}

export async function listCompetitions(): Promise<CompetitionSummary[]> {
  const { data, error } = await client().from('competitions').select('id,name,description,status,game_type,timezone,updated_at,created_at').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id, name: row.name, description: row.description, status: row.status, gameType: row.game_type,
    timezone: row.timezone, updatedAt: row.updated_at, createdAt: row.created_at,
  })) as CompetitionSummary[];
}

export async function createCompetition(input: z.input<typeof competitionSchema>): Promise<CompetitionSummary> {
  const valid = competitionSchema.parse(input);
  const { data, error } = await client().from('competitions').insert({
    name: valid.name, description: valid.description || null, game_type: valid.gameType, timezone: valid.timezone,
  }).select('id,name,description,status,game_type,timezone,updated_at,created_at').single();
  if (error) throw error;
  return { id: data.id, name: data.name, description: data.description, status: data.status, gameType: data.game_type, timezone: data.timezone, updatedAt: data.updated_at, createdAt: data.created_at } as CompetitionSummary;
}

export async function getCompetition(id: string): Promise<CompetitionSummary | null> {
  const { data, error } = await client().from('competitions').select('id,name,description,status,game_type,timezone,updated_at,created_at').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.name, description: data.description, status: data.status, gameType: data.game_type, timezone: data.timezone, updatedAt: data.updated_at, createdAt: data.created_at } as CompetitionSummary;
}

export async function getTeams(competitionId: string): Promise<Team[]> {
  const { data, error } = await client().from('teams').select('id,competition_id,team_number,name,color,alliance,archived_at').eq('competition_id', competitionId).is('archived_at', null).order('team_number');
  if (error) throw error;
  return (data ?? []).map((t) => ({ id: t.id, competitionId: t.competition_id, number: t.team_number, name: t.name, color: t.color, alliance: t.alliance, archivedAt: t.archived_at })) as Team[];
}

export async function getRules(competitionId: string): Promise<ScoringRule[]> {
  const { data, error } = await client().from('scoring_rules').select('*').eq('competition_id', competitionId).eq('is_active', true).order('display_order');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, competitionId: r.competition_id, version: r.version, ruleKey: r.rule_key, displayName: r.display_name,
    description: r.description, scoringType: r.scoring_type, pointsPerUnit: Number(r.points_per_unit), unitLabel: r.unit_label,
    quantityIncrement: Number(r.quantity_increment), minQuantity: Number(r.min_quantity), maxQuantity: r.max_quantity === null ? null : Number(r.max_quantity),
    allowNegative: r.allow_negative, appliesTo: r.applies_to, allowedPeriods: r.allowed_periods, multiplier: Number(r.multiplier), repeatable: r.repeatable,
    confirmationRequired: r.confirmation_required, buttonLabel: r.button_label, buttonColor: r.button_color, displayOrder: r.display_order, isActive: r.is_active, formula: r.formula,
  })) as ScoringRule[];
}

export async function getMatch(matchId: string): Promise<Match | null> {
  const { data, error } = await client().from('match_live_state').select('payload').eq('match_id', matchId).maybeSingle();
  if (error) throw error;
  return data?.payload ? (data.payload as Match) : null;
}

export async function getFirstLiveMatch(competitionId: string): Promise<Match | null> {
  const { data, error } = await client().from('matches').select('id').eq('competition_id', competitionId).neq('status', 'void').order('scheduled_at', { ascending: true, nullsFirst: true }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? getMatch(data.id) : null;
}

export async function createTeam(input: { competitionId: string; number: string; name: string; color: string; alliance: 'red' | 'blue' | null }) {
  const number = input.number.trim(); const name = input.name.trim();
  if (!number || number.length > 40 || !name || name.length > 100) throw new Error('Enter a valid team number and name.');
  const { data, error } = await client().from('teams').insert({ competition_id: input.competitionId, team_number: number, name, color: input.color, alliance: input.alliance }).select('id,competition_id,team_number,name,color,alliance').single();
  if (error) throw error;
  return { id: data.id, competitionId: data.competition_id, number: data.team_number, name: data.name, color: data.color, alliance: data.alliance } as Team;
}

export async function createMatch(input: { competitionId: string; number: string; name: string; participants: { teamId: string; alliance: 'red' | 'blue'; station: number }[]; override?: boolean }) {
  const number = input.number.trim();
  if (!number || number.length > 30) throw new Error('Enter a valid match number.');
  const format = input.override ? { periods: [{ key: 'autonomous', duration_ms: 15000 }, { key: 'driver', duration_ms: 105000 }, { key: 'final', duration_ms: 0 }] } : { periods: [{ key: 'match', duration_ms: 120000 }] };
  const duration = input.override ? 120000 : 120000;
  const { data, error } = await client().from('matches').insert({ competition_id: input.competitionId, match_number: number, name: input.name.trim() || `Match ${number}`, status: 'ready', format_snapshot: format, timer_duration_ms: duration, active_period_key: input.override ? 'autonomous' : 'match' }).select('id').single();
  if (error) throw error;
  if (input.participants.length) {
    const { error: participantsError } = await client().from('match_participants').insert(input.participants.map((participant) => ({ match_id: data.id, team_id: participant.teamId, alliance: participant.alliance, station: participant.station })));
    if (participantsError) throw participantsError;
  }
  const match = await getMatch(data.id);
  if (!match) throw new Error('Match created but could not be loaded. Refresh the page.');
  return match;
}

type UsernameAuthResponse = {
  session: { access_token: string; refresh_token: string };
  recoveryAvailable: false;
};

async function usernameAuth(action: 'signup' | 'signin', username: string, password: string) {
  const { data, error } = await client().functions.invoke<UsernameAuthResponse>('username-auth', { body: { action, username, password } });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      if (context.status === 404) throw new Error('Username-only accounts are not enabled on this Supabase project yet. Deploy the username-auth Edge Function, then try again.');
      try {
        const body = await context.clone().json() as { error?: string };
        if (body.error) throw new Error(body.error);
      } catch (reason) {
        if (reason instanceof Error && reason.message !== 'Unexpected end of JSON input') throw reason;
      }
    }
    throw new Error('Username authentication is temporarily unavailable. Try again or use an email address.');
  }
  if (!data?.session) throw new Error(action === 'signin' ? 'Invalid username or password.' : 'Account created without a session. Please sign in.');
  const { error: sessionError } = await client().auth.setSession(data.session);
  if (sessionError) throw sessionError;
}

export async function signUpWithoutEmail(username: string, password: string) {
  await usernameAuth('signup', username, password);
}

export async function signInWithUsername(username: string, password: string) {
  await usernameAuth('signin', username, password);
}

export async function exchangeControllerCredential(credential: string) {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const res = await fetch(`${url}/functions/v1/controller-session`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: key }, body: JSON.stringify({ credential }) });
  if (!res.ok) throw new Error('This controller link is expired, revoked, or unavailable.');
  return res.json() as Promise<{ sessionToken: string; expiresAt: string; competitionId: string; permissions: Record<string, unknown>; matchId: string | null }>;
}

export async function getControllerMatch(matchId: string, sessionToken: string): Promise<Match | null> {
  const { data, error } = await client().rpc('match_live_payload', { p_match_id: matchId, p_controller_session: sessionToken });
  if (error) throw error;
  return data as Match | null;
}

export async function invokeAction(request: ActionRequest, controllerSession?: string): Promise<ActionResult> {
  const { data, error } = await client().functions.invoke<ActionResult>('match-action', {
    body: request,
    headers: controllerSession ? { 'x-controller-session': controllerSession } : undefined,
  });
  if (error) throw error;
  if (!data) throw new Error('The scoring service returned no state.');
  return data;
}

export function subscribeCompetition(competitionId: string, refresh: () => void) {
  const channel = client().channel(`competition:${competitionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `competition_id=eq.${competitionId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'score_events', filter: `competition_id=eq.${competitionId}` }, refresh)
    .subscribe();
  return () => { void client().removeChannel(channel); };
}
