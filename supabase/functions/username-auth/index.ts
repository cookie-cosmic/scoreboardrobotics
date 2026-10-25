import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { corsHeaders, errorResponse, opaqueToken, response, sha256 } from '../_shared/http.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const publicAuth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const usernamePattern = /^[a-z0-9_.-]{3,40}$/;
const minimumPasswordLength = 12;

function clientAddress(request: Request) {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
}

async function consumeRateLimit(request: Request, username: string) {
  const keyHash = await sha256(`${username}|${clientAddress(request)}`);
  const { data, error } = await admin.rpc('consume_username_auth_limit', {
    p_key_hash: keyHash,
    p_limit: 5,
    p_window_seconds: 900,
  });
  if (error || data !== true) return false;
  return true;
}

function validInput(input: unknown): input is { action: 'signup' | 'signin'; username: string; password: string } {
  if (!input || typeof input !== 'object') return false;
  const value = input as Record<string, unknown>;
  return (value.action === 'signup' || value.action === 'signin')
    && typeof value.username === 'string'
    && typeof value.password === 'string';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return errorResponse(request, 405, 'Method not allowed.');

  try {
    const input = await request.json();
    if (!validInput(input)) return errorResponse(request, 400, 'Invalid request.');
    const username = input.username.trim().toLowerCase();
    if (!usernamePattern.test(username) || input.password.length < minimumPasswordLength || input.password.length > 128) {
      return errorResponse(request, 400, 'Use a username of 3–40 letters, numbers, dots, dashes, or underscores and a password of at least 12 characters.');
    }
    if (!await consumeRateLimit(request, username)) return errorResponse(request, 429, 'Try again later.');

    if (input.action === 'signup') {
      const { data: existing } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
      if (existing) return errorResponse(request, 409, 'That username is unavailable.');

      // The .invalid TLD is reserved and cannot receive email. It exists only because
      // Supabase's password provider requires an Auth email identifier.
      const internalEmail = `u_${opaqueToken().slice(0, 38).toLowerCase()}@users.matchforge.invalid`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: internalEmail,
        password: input.password,
        email_confirm: true,
        user_metadata: { username, no_recovery_email: true },
      });
      if (createError || !created.user?.email) return errorResponse(request, 422, 'We could not create that account. Try a different username.');
      const { data: signedIn, error: signInError } = await publicAuth.auth.signInWithPassword({ email: internalEmail, password: input.password });
      if (signInError || !signedIn.session) return errorResponse(request, 500, 'Account was created, but sign-in could not be completed. Try signing in again.');
      return response(request, { session: signedIn.session, user: signedIn.user, recoveryAvailable: false }, 201);
    }

    const { data: profile } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
    if (!profile) return errorResponse(request, 401, 'Invalid username or password.');
    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(profile.id);
    if (userError || !userResult.user.email) return errorResponse(request, 401, 'Invalid username or password.');
    const { data: signedIn, error: signInError } = await publicAuth.auth.signInWithPassword({ email: userResult.user.email, password: input.password });
    if (signInError || !signedIn.session) return errorResponse(request, 401, 'Invalid username or password.');
    return response(request, { session: signedIn.session, user: signedIn.user, recoveryAvailable: false });
  } catch {
    return errorResponse(request, 400, 'Malformed request.');
  }
});
