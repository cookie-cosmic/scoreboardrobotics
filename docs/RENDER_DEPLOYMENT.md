# Render + Firebase Deployment

MatchForge uses:
- **Firebase Hosting** for the frontend URL/domain (`https://roboticscoreboard.web.app`).
- **Supabase** for backend (auth, database, Edge Functions).
- **Render** for push/pull and deployments: Render builds the Vite app and deploys it to Firebase Hosting on every push. Render does **not** serve the app.

## Render service
- Type: Web service (free), name `matchforge-deployer`
- Build: `npm ci && npm run build`
- Start: deploys `dist` to Firebase Hosting via Firebase CLI, then keeps a tiny health endpoint alive
- Env vars to set in Render dashboard:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `FIREBASE_TOKEN` — from `npx firebase login:ci`

## Firebase
- Hosting remains the public URL/domain (see `firebase.json`, `.firebaserc`).
- The Firebase auto-deploy workflow is manual-only now (Render handles pushes).
- Supabase redirect URLs should include `https://roboticscoreboard.web.app` (and localhost for dev).

## Notes
- `render.yaml` defines the Render deployer service.
- CI still runs lint/test/build via `.github/workflows/ci.yml`.
- If you prefer GitHub Actions instead, run the manual `Deploy to Firebase Hosting` workflow.
