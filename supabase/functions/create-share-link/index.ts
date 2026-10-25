import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { corsHeaders, errorResponse, opaqueToken, response, sha256 } from '../_shared/http.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return errorResponse(request, 405, 'Method not allowed.');
  try {
    const auth = request.headers.get('authorization');
    if (!auth) return errorResponse(request, 401, 'Sign in required.');
    const input = await request.json();
    if (!uuid.test(input?.competitionId ?? '') || !['controller', 'display'].includes(input?.kind) || typeof input?.label !== 'string' || input.label.trim().length < 1 || input.label.trim().length > 80) return errorResponse(request, 400, 'Invalid share-link request.');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) return errorResponse(request, 400, 'Choose an expiration within 90 days.');
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return errorResponse(request, 401, 'Sign in required.');
    const { data: member } = await userClient.from('competition_members').select('role').eq('competition_id', input.competitionId).eq('user_id', user.id).maybeSingle();
    if (!member || !['owner', 'administrator'].includes(member.role)) return errorResponse(request, 403, 'Only an owner or administrator can create a share link.');
    const token = opaqueToken(); const tokenHash = await sha256(token); const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const base = request.headers.get('origin') || Deno.env.get('PUBLIC_APP_URL') || '';
    if (!base) return errorResponse(request, 500, 'Public application URL is not configured.');
    if (input.kind === 'controller') {
      const permissions = { score: Boolean(input.permissions?.score), timer: Boolean(input.permissions?.timer), undo: Boolean(input.permissions?.undo), finalize: false, match_ids: Array.isArray(input.permissions?.matchIds) ? input.permissions.matchIds.filter((id: unknown) => typeof id === 'string' && uuid.test(id)) : [] };
      const { data, error } = await admin.from('controller_links').insert({ competition_id: input.competitionId, label: input.label.trim(), token_hash: tokenHash, permissions, expires_at: expiresAt.toISOString(), created_by: user.id }).select('id').single();
      if (error) return errorResponse(request, 500, 'Could not create controller link.');
      await admin.from('audit_logs').insert({ competition_id: input.competitionId, actor_user_id: user.id, action: 'controller_link.created', entity_type: 'controller_link', entity_id: data.id, details: { permissions, expires_at: expiresAt.toISOString() } });
      // Credential in fragment: it is not sent to the server in ordinary navigation or Referer headers.
      return response(request, { id: data.id, url: `${base}/controller/${input.competitionId}#access=${token}`, expiresAt: expiresAt.toISOString(), permissions });
    }
    const { data, error } = await admin.from('public_display_links').insert({ competition_id: input.competitionId, label: input.label.trim(), token_hash: tokenHash, expires_at: expiresAt.toISOString(), created_by: user.id }).select('id').single();
    if (error) return errorResponse(request, 500, 'Could not create display link.');
    await admin.from('audit_logs').insert({ competition_id: input.competitionId, actor_user_id: user.id, action: 'display_link.created', entity_type: 'public_display_link', entity_id: data.id, details: { expires_at: expiresAt.toISOString() } });
    return response(request, { id: data.id, url: `${base}/display/${input.competitionId}#access=${token}`, expiresAt: expiresAt.toISOString(), readOnly: true });
  } catch { return errorResponse(request, 400, 'Malformed request.'); }
});
