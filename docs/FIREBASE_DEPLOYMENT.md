# Firebase Hosting deployment (frontend)

MatchForge's frontend is a Vite/React single-page app. The Supabase project remains the backend
(auth, database, Edge Functions). Firebase Hosting only serves the built SPA.

## Subdomain

This project is configured for the Firebase Hosting default subdomain:

- https://roboticscoreboard.web.app
- https://roboticscoreboard.firebaseapp.com

The Firebase project id is `roboticscoreboard` (project number `463693560160`), recorded in
`.firebaserc`. No custom domain is required; "subdomain to Firebase" means the app is served from
Firebase's `*.web.app` subdomain above.

## One-time setup

1. Install the Firebase CLI: `npm install -g firebase-tools`
2. Log in: `firebase login`
3. Verify project selection: `firebase use roboticscoreboard` (uses `.firebaserc`)
4. In the Supabase dashboard, add the Firebase URLs to **Auth → URL Configuration → Redirect URLs**:
   - `https://roboticscoreboard.web.app`
   - `https://roboticscoreboard.web.app/**`
   - `https://roboticscoreboard.firebaseapp.com`
   - `https://roboticscoreboard.firebaseapp.com/**`
   (Also keep `http://localhost:5173` for local dev.) `supabase/config.toml` already lists these.
5. Set Supabase Edge Function allowed origins to the Firebase URLs if you pin origins.

## Required GitHub repository secrets (for CI deploy)

- `VITE_SUPABASE_URL` — e.g. `https://exlvisdbjkhmcculjuwj.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — the public anon/publishable key
- `FIREBASE_SERVICE_ACCOUNT` — JSON key for a service account with Firebase Hosting Admin
- `SUPABASE_ACCESS_TOKEN` — (optional, for `deploy-supabase.yml`) Supabase personal access token
## Connect to your GitHub repository

Your repository is `https://github.com/cookie-cosmic/scoreboardrobotics.git`. From the project folder:

```bash
git init
git remote add origin https://github.com/cookie-cosmic/scoreboardrobotics.git
git add .
git commit -m "Initial MatchForge with Firebase Hosting config"
git branch -M main
git push -u origin main
```

After pushing, the `Deploy to Firebase Hosting` workflow runs automatically on `main`.

- `SUPABASE_PROJECT_REF` — e.g. `exlvisdbjkhmcculjuwj`

## Deploy manually

```bash
npm ci
cp .env.production.example .env.production
# edit .env.production with real values
npm run deploy:firebase
```

## Deploy via GitHub Actions

Push to `main`/`master` runs `.github/workflows/deploy-firebase.yml`, which builds with the secrets
above and deploys to the live channel. Supabase backend changes are deployed separately via the
manual `deploy-supabase.yml` workflow.

## SPA routing

`firebase.json` rewrites all paths to `/index.html` so React Router (BrowserRouter) deep links work.
`dist` is the build output directory.

## Security headers

`firebase.json` sets `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS.
Add a `Content-Security-Policy` at the hosting layer if desired (see README).
