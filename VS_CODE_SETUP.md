# Open MatchForge in Visual Studio Code

## 1. Extract and open

1. Extract `MatchForge-VSCode.zip` to a normal development folder.
2. In VS Code, choose **File → Open Workspace from File…** and select `matchforge.code-workspace`.
   - Or choose **File → Open Folder…** and select the extracted project folder.
3. Accept the recommended extensions when VS Code offers them.

## 2. Install project dependencies

Open **Terminal → New Terminal** in VS Code and run:

```bash
npm install
```

## 3. Configure the public frontend environment

Copy the example file:

```bash
# macOS / Linux
cp .env.example .env.local

# Windows PowerShell
Copy-Item .env.example .env.local
```

In `.env.local`, set only browser-safe values:

```env
VITE_SUPABASE_URL=https://exlvisdbjkhmcculjuwj.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

`VITE_SUPABASE_ANON_KEY` is safe for a browser. Never put a service-role key, database password, Supabase personal token, or SMTP password in `.env.local`.

## 4. Apply the supplied backend project

The source contains migrations and Edge Functions, but they must be deployed to your own Supabase project before registration, competitions, and scoring can work.

```bash
npx supabase login
npx supabase link --project-ref exlvisdbjkhmcculjuwj
npx supabase db push
```

Then deploy the functions:

```bash
npx supabase functions deploy match-action --no-verify-jwt
npx supabase functions deploy controller-session --no-verify-jwt
npx supabase functions deploy create-share-link --no-verify-jwt
npx supabase functions deploy username-auth --no-verify-jwt
```

The username-only option requires `username-auth`. Username-only accounts intentionally have no email password-recovery channel.

## 5. Start the website

Use either VS Code’s **Terminal → Run Task → MatchForge: Start app** or:

```bash
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`.

## Useful VS Code tasks

- **MatchForge: Start app** — run the Vite development server
- **MatchForge: Validate** — lint, unit test, type-check, and production-build
- **MatchForge: Browser tests** — run Playwright browser tests
- **MatchForge: Apply Supabase migrations** — push database migrations after linking
- **MatchForge: Deploy Supabase functions** — deploy all server-side functions

## Before a production deployment

Read `README.md`, `docs/SECURITY.md`, and `docs/BACKUP_RECOVERY.md`. Configure production redirect URLs, explicit Edge Function origins, SMTP, rate limits, MFA policy, HTTPS, and backups before an event.
