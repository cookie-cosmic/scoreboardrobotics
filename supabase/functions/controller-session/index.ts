import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { corsHeaders, errorResponse, opaqueToken, response, sha256 } from '../_shared/http.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return errorResponse(request, 405, 'Method not allowed.');
  try {
    const body = await request.json();
    const credential = typeof body?.credential === 'string' ? body.credential : '';
    if (credential.length < 40 || credential.length > 200) return errorResponse(request, 404, 'Controller link unavailable.');
    const hash = await sha256(credential);
    const { data: link } = await admin.from('controller_links').select('id,competition_id,permissions,expires_at,revoked_at').eq('token_hash', hash).maybeSingle();
    if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) return errorResponse(request, 404, 'Controller link unavailable.');
    const sessionToken = opaqueToken();
    const sessionHash = await sha256(sessionToken);
    const expiry = new Date(Math.min(new Date(link.expires_at).getTime(), Date.now() + 30 * 60 * 1000));
    const { error } = await admin.from('controller_sessions').insert({ controller_link_id: link.id, session_hash: sessionHash, expires_at: expiry.toISOString() });
    if (error) return errorResponse(request, 500, 'Could not establish a controller session.');
    await admin.from('controller_links').update({ last_used_at: new Date().toISOString() }).eq('id', link.id);
    const permittedIds = Array.isArray(link.permissions?.match_ids) ? link.permissions.match_ids.filter((id: unknown) => typeof id === 'string') : [];
    let matchQuery = admin.from('matches').select('id').eq('competition_id', link.competition_id).neq('status', 'void').order('scheduled_at', { ascending: true, nullsFirst: true }).limit(1);
    if (permittedIds.length) matchQuery = matchQuery.in('id', permittedIds);
    const { data: activeMatch } = await matchQuery.maybeSingle();
    return response(request, { sessionToken, expiresAt: expiry.toISOString(), competitionId: link.competition_id, permissions: link.permissions, matchId: activeMatch?.id ?? null });
  } catch { return errorResponse(request, 400, 'Malformed request.'); }
});
