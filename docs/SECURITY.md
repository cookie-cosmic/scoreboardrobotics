# Security operations guide

## Trust boundaries

| Boundary | Control |
|---|---|
| Browser → Supabase | public anon key only; authenticated JWT; RLS on every application table |
| Browser → Edge Function | input-shape checks, restrictive CORS, no-store responses, safe generic errors |
| Edge Function → database | user JWT for action RPC; service role only inside link-exchange / link-creation function |
| Controller link | random 256-bit secret stored only as SHA-256 hash; fragment delivery; 30-minute hashed session; permissions + expiration + revocation |
| Official score | transactional database function, match lock, rule snapshot, idempotency key, audit log |

## Required deployment controls

1. **Auth:** Require confirmed email for email-backed accounts, strong passwords, CAPTCHA/rate limits, production SMTP, short JWT lifetime, and an MFA enrollment policy for owners and administrators. A username-only account has no recovery channel by design; disclose that before creation. Avoid user enumeration in recovery messaging.
2. **Origins:** Set `ALLOWED_ORIGINS` explicitly in every production function. Do not leave the development fallback (reflecting an origin) enabled in production.
3. **Secrets:** Service-role credentials exist only in Supabase function secrets. Do not copy them to `.env.local`, frontend environment variables, tickets, logs, or screenshots. Rotate after suspected exposure.
4. **Permissions:** Test all RLS policies in a separate project. Owners cannot be demoted directly; UI must not offer role changes to the caller’s own authority.
5. **Public sharing:** Controller and display links are different database records. Give controller links the smallest action set and short expiry. Revoke after an event. Do not put reusable credentials in query strings; MatchForge uses fragments and a one-time exchange session.
6. **Content safety:** Render user input as React text. Never use `dangerouslySetInnerHTML` for team names, descriptions, or audit fields. Store logos in a private Storage bucket with ownership policy before enabling uploads.
7. **Deployment:** HTTPS, HSTS, CSP, Referrer-Policy `no-referrer`, `frame-ancestors`, CORS allowlist, WAF/rate limiting, structured error monitoring, and alerting on repeated controller session failures.
8. **Change control:** Protect production branches, lock dependencies, scan secrets, review migration SQL, run tests, apply migrations with a backup window, and retain audit logs according to published policy.

## Authorization matrix

| Operation | Owner | Admin | Scorekeeper | Viewer | Controller link |
|---|---:|---:|---:|---:|---:|
| View private competition | ✓ | ✓ | ✓ | ✓ | scoped only |
| Edit teams/rules/settings | ✓ | ✓ | — | — | — |
| Invite/revoke members | ✓ | ✓ | — | — | — |
| Score / correction | ✓ | ✓ | ✓ | — | only if `score` |
| Timer start/pause/stop | ✓ | ✓ | ✓ | — | only if `timer` |
| Timer reset | ✓ | ✓ | — | — | never |
| Undo other users’ event | ✓ | ✓ | — | — | no default |
| Finalize match | ✓ | ✓ | — | — | no default |
| Create controller/display link | ✓ | ✓ | — | — | — |

## Incident response

1. Revoke affected controller/display links, member sessions, and Supabase refresh tokens.
2. Rotate the service-role key and any suspected deployment secret; redeploy all affected functions.
3. Preserve audit logs and database backups; do not alter historical events while investigating.
4. Identify data scope and notify affected users as required by your policy/law.
5. Patch, add a regression test, review RLS/function logs, and document the incident timeline.

## Validation status

The code implements important controls, but no checklist alone proves an application secure. Production security requires test execution against the deployed configuration, independent review, monitoring, and ongoing remediation.
