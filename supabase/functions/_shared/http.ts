export const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  // In development an empty allow-list accepts the calling origin. Configure explicit origins in production.
  const allowOrigin = allowed.length === 0 ? origin : (allowed.includes(origin) ? origin : 'null');
  return { ...jsonHeaders, 'access-control-allow-origin': allowOrigin, 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-controller-session', 'access-control-allow-methods': 'POST, OPTIONS', 'vary': 'Origin' };
}

export function response(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

export function errorResponse(request: Request, status: number, message: string) {
  return response(request, { error: message }, status);
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('');
}

export function opaqueToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function requestId(request: Request) { return request.headers.get('x-request-id') ?? crypto.randomUUID(); }
