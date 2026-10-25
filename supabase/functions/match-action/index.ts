import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { corsHeaders, errorResponse, response } from '../_shared/http.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const acceptedActions = new Set(['score', 'correction', 'undo', 'timer', 'override_tally', 'finalize']);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return errorResponse(request, 405, 'Method not allowed.');
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || !acceptedActions.has(body.action) || !uuid.test(body.matchId ?? '') || !uuid.test(body.idempotencyKey ?? '')) {
      return errorResponse(request, 400, 'Invalid action request.');
    }
    if (body.expectedVersion !== undefined && (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 0)) return errorResponse(request, 400, 'Invalid timer version.');
    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) return errorResponse(request, 400, 'Invalid action payload.');
    const authorization = request.headers.get('authorization') ?? '';
    const controllerSession = request.headers.get('x-controller-session');
    if (!authorization && !controllerSession) return errorResponse(request, 401, 'Authentication or a controller session is required.');
    const client = createClient(supabaseUrl, anonKey, { global: { headers: authorization ? { Authorization: authorization } : {} }, auth: { persistSession: false, autoRefreshToken: false } });
    const action = { action: body.action, ...body.payload };
    const { data, error } = await client.rpc('match_action', {
      p_match_id: body.matchId,
      p_action: action,
      p_idempotency_key: body.idempotencyKey,
      p_expected_timer_version: body.expectedVersion ?? null,
      p_controller_session: controllerSession ?? null,
    });
    if (error) {
      const conflict = error.code === '40001';
      const forbidden = error.code === '42501';
      const locked = error.code === '55000';
      return errorResponse(request, conflict ? 409 : forbidden ? 403 : locked ? 423 : 422, conflict ? 'The timer changed on another device. Refreshing is required.' : forbidden ? 'You are not authorized for this action.' : locked ? 'This match is locked.' : 'The action was rejected by the scoring engine.');
    }
    const { data: payload, error: payloadError } = await client.rpc('match_live_payload', { p_match_id: body.matchId, p_controller_session: controllerSession ?? null });
    if (payloadError) return errorResponse(request, 500, 'The action was saved, but state refresh failed. Reload to reconcile.');
    return response(request, { match: payload, result: data, idempotent: data?.status === 'idempotent' });
  } catch {
    return errorResponse(request, 400, 'Malformed request.');
  }
});
