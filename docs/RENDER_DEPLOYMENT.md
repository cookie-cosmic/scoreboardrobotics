# Render Deployment (Frontend)

MatchForge deploys its Vite/React frontend to Render as a static site. Supabase remains the backend.

## Service
- Name: `scoreboardrobotics`
- URL: `https://scoreboardrobotics.onrender.com`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- SPA routing: rewrite `/*` → `/index.html` (defined in `render.yaml`)

## Setup
1. Push this repo to GitHub (branch `main`).
2. In Render dashboard: **New → Blueprint** and select this repository. Render reads `render.yaml`.
3. When prompted, set:
   - `VITE_SUPABASE_URL` — e.g. `https://exlvisdbjkhmcculjuwj.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` — the public anon key
4. Deploy. Render auto-deploys on every push to `main`.

## Supabase
- Site URL and redirect URLs are configured for `https://scoreboardrobotics.onrender.com` in `supabase/config.toml`.
- Add the same URL to Supabase Auth redirect URLs in the dashboard if you deploy DB/auth changes.

## Notes
- `render.yaml` caches hashed assets under `/assets/*` and disables caching for `index.html`.
- CI still runs lint/test/build via `.github/workflows/ci.yml`.
- Firebase Hosting config is retained but no longer auto-deploys (manual workflow only).
