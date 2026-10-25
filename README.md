# MatchForge — robotics scoring & remote-control platform

MatchForge is a React + TypeScript application and Supabase backend foundation for private robotics competitions, configurable mini-games, real-time scoring, remote phone control, and audience displays.

> **Status — implementation baseline:** The repository contains a runnable responsive frontend, Supabase Auth integration points, normalized schema, RLS policies, transactional scoring/timer RPC, secure controller-link exchange functions, and scoring tests. A Supabase project must be provisioned before the application can accept accounts or official scores; the UI intentionally refuses to create local-only users, scores, or sample competitions.

## What is implemented

- **Accounts:** Supabase Auth email login/sign-up/recovery plus optional username/password-only accounts; profile creation trigger; session expiry and optional MFA guidance. Username-only accounts intentionally have no password-recovery channel.
- **Isolation and roles:** owner, administrator, scorekeeper, viewer; competition-scoped Row Level Security policies; owner-demotion protection; audit log structure.
- **Competition foundation:** private competitions, teams, versioned rules, match participants, status lifecycle, draft/active/completed/archived states, builder UI, VEX-style and custom templates.
- **Authoritative actions:** `match_action` locks a match row, checks permission and state, validates rules, enforces idempotency, creates immutable score events, refreshes a calculated result, and records timer transitions. It never accepts a client-provided total.
- **Timer model:** persisted elapsed duration, started timestamp, state/timer versions, timer event history, stale-command rejection, pause/recovery support.
- **Live state:** a scoped `match_live_state` view and Edge Function for state refresh after accepted actions. Realtime subscriptions are wired in the browser client for authorized users.
- **Remote modes:** same-account access, member role model, and expiring/revocable controller links. Public controller credentials are created as random 256-bit values, retained as hashes, and delivered in URL fragments (not query strings); the fragment is exchanged for a 30-minute scoped session. Public display links use separate credentials.
- **VEX V5RC Override:** a separate tally model—not an editable generic counter list—with manual version pinning, documented score table, field state JSON, and calculator. It is pinned to **2026–2027 Override Game Manual v2.1**.
- **UI:** desktop builder and operations dashboard, responsive scoring console, live phone-controller action path, and a controls-free fullscreen display.
- **Tests:** deterministic scoring/timer/VEX unit tests and a Playwright authentication/data-gate smoke test. See [Testing](#testing).

## Important scope notes

1. This project is **not an official VEX product** and is not affiliated with or endorsed by VEX Robotics or the Robotics Education & Competition Foundation.
2. Override values in this source were verified on October 24, 2026 against the official [VEX manual portal](https://manuals.vex.com/) and the [Override v2.1 game section](https://manuals.vex.com/v5/override/v2.1/game/): 15-second autonomous, 1:45 driver period; 5 per scored alliance-colored Pin Half; 10 per owned yellow Pin Half; 8 per Robot ending in Midfield; 12 Autonomous Bonus (6 each on a tie). Ownership and placement still require referee judgement under the full manual and official [Q&A](https://events.vex.com/V5RC/2026-2027/QA). The app captures referee inputs; it does not use computer vision to decide legal placements or penalties.
3. A production rollout must add integration tests against a dedicated Supabase test project and conduct a deployment-specific security review. A schema and checklist are controls, not proof of security.

## Local development

### Prerequisites

- Node 20+
- A Supabase project and Supabase CLI for real persistence
- Docker if using `supabase start` locally

### 1. Install and run the UI

```bash
npm install
cp .env.example .env.local
# Configure the public project values first; no local scoring fallback is available.
npm run dev
```

Open the URL printed by Vite after configuring the public Supabase variables. Without them, the app presents setup guidance and does not create local-only data.
### Firebase Hosting (frontend subdomain)

This project is configured for Firebase Hosting on the `roboticscoreboard` Firebase project. The app is served from
`https://roboticscoreboard.web.app` (see `firebase.json`, `.firebaserc`, and `docs/FIREBASE_DEPLOYMENT.md`).
Backend remains Supabase; set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env.local` (dev) or as GitHub
secrets (CI).



### 2. Provision Supabase

1. Create a new Supabase project.
2. Copy its **Project URL** and **anon/public key** into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Do **not** put a service-role key in this file.
3. Install/login to the Supabase CLI, link the project, then apply schema:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

4. In **Authentication** settings:
   - set Site URL and Redirect URLs for each deployed frontend origin;
   - require email confirmation in production;
   - configure an SMTP provider (not the default development mailer);
   - set password policy to at least 12 characters and configure CAPTCHA / rate limits;
   - enable MFA enrollment for administrators / owners according to your organization policy.
5. Configure function secrets **only in Supabase**:

   ```bash
   supabase secrets set ALLOWED_ORIGINS=https://app.example.org PUBLIC_APP_URL=https://app.example.org
   # Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to functions.
   supabase functions deploy match-action --no-verify-jwt
   supabase functions deploy controller-session --no-verify-jwt
   supabase functions deploy create-share-link --no-verify-jwt
   supabase functions deploy username-auth --no-verify-jwt
   ```

   `--no-verify-jwt` is intentional only because the function supports a narrow unauthenticated controller-session exchange. `match-action` performs an authenticated RPC or validates a hashed, scoped controller session itself. Do not expose the service-role key to the web app.


### 3. Create the first competition

1. Sign up through the login screen. The auth trigger makes a `profiles` row.
2. Use **New competition**; the insert trigger adds you as Owner and seeds the pinned Override tally inputs when applicable.
3. Add teams/rules/matches from the manager workspace (manager operations are directly protected by RLS).
4. Make the competition `active`, select a scheduled match, and use the phone controller URL.
5. Create a separate, expiring public display link if a display should be public. Never reuse a controller link for a display.

## Architecture

```text
React/Vite browser
  ├─ Supabase Auth (public anon key only)
  ├─ RLS-protected PostgREST reads / Realtime subscriptions
  └─ Edge Functions → security-definer transactional RPC → PostgreSQL
                                              ├─ score_events (source of truth)
                                              ├─ timer_events
                                              ├─ match_results (derived cache)
                                              ├─ override_match_tallies
                                              └─ audit_logs
```

### Event and timer behavior

- Scores are calculated from a rule snapshot in the database, recorded once under `(match_id, idempotency_key)`, then aggregated. Corrections and undos retain the original event.
- A timer is not a browser interval. Its display derives from persisted `timer_elapsed_ms + (server/start timestamp)`; transitions lock the match and require the current `timer_version`.
- A client that loses connection marks its action unconfirmed and should fetch `match_live_payload` on reconnect. Offline score queueing is intentionally **not enabled** until product-specific conflict review and integration tests are completed; timer resets are never queued.
- Once finalized, match mutations are rejected. An administrator must use an accountable correction workflow added by policy rather than silently rewrite history.

## VEX Override configuration

The `override_match_tallies` table maintains the official V2.1 components separately from generic rules:

- red / blue alliance-color Pin Halves;
- yellow Pin Halves owned in Quadrant Goals via Toggles;
- yellow Pin Halves owned in the Midfield Goal from end-of-match Midfield robot count;
- red / blue Robots ending in Midfield;
- autonomous winner/tie; and
- a referee-maintained field state (Toggles and Goals).

The SQL `override_scores` function applies only published numerical values. It does **not** infer the legal “Placed”, “Scored”, “Owned”, violation, Match Affecting, or tie-breaker states. Those depend on the full manual and a referee. Existing competitions store their manual and configuration version, so later rule updates must be installed as new configurations rather than rewriting finalized match history.

## Testing

```bash
npm run test
npm run build
npm run lint
# first time only: npx playwright install chromium
npm run test:e2e
```

The next production gate should include CI against a disposable Supabase project covering: account recovery, isolation, RLS denial cases, role matrix, expired/revoked links, controller exchange, duplicate action delivery, simultaneous score requests, timer stale-version conflict, finalization, reconnect reconciliation, CSV import/export, accessibility, and backed-up restore rehearsal.

## Deployment security and operations

Read [docs/SECURITY.md](docs/SECURITY.md) before deployment and [docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md) before operating a real event.

Suggested frontend security headers (set at hosting layer):

```text
Content-Security-Policy: default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

Use HTTPS only. Pin production package versions with `package-lock.json`; run `npm audit`, secret scanning, dependency update review, and tests in CI. The current `npm install` audit output should be reviewed and remediated before production launch.
