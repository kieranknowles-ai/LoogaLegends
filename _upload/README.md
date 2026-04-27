# LOOGA LEGENDS

Custom-rules FPL dashboard for league **375288**. Pulls weekly scores from the FPL public API, applies your league's bespoke fines (loser-of-the-week, below-average, gloats, missed reports), and shows the running pot.

## Stack

- Next.js 16 (App Router) on Vercel Hobby (free)
- Supabase free tier (Postgres + Auth)
- FPL public API (no key needed)

Total cost at expected volumes: **£0/month**.

## House rules implemented

| Rule | How it's computed |
|---|---|
| Loser-of-the-week fine | `15p × (winner − loser)` per GW, applied to the GW's lowest scorer |
| Below-average fine | `10p × (national_avg − points)` per GW, for everyone below `events[gw].average_entry_score` |
| Gloat fine | £1, manual proposal, requires another member to second |
| Missed-report fine | £10 × 1.5ⁿ where n = prior applied missed reports this season |
| Easy Third | Cumulative-points-leader 3rd place — gets to pick the night-out venue |
| Night-out buy-in | `total_pot / num_players` — what non-playing attendees pay |

Voting flow: any member can propose a gloat / missed report; another member (not the target, not the proposer) seconds it; once seconded, the fine is applied automatically. Admin can void any proposal.

## Local setup

```bash
npm install
cp .env.local.example .env.local   # fill in your values
npm run dev                        # http://localhost:3000
```

### Get your Supabase keys

1. Sign in to https://supabase.com (free tier).
2. Create a new project. Pick a region close to you (e.g. `eu-west-2`).
3. Once it's provisioned, **Settings → API** gives you:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret, server-only)

### Apply the migration

In the Supabase dashboard → **SQL Editor** → paste the contents of `supabase/migrations/0001_init.sql` → run.

(Or if you set up the Supabase CLI: `supabase db push`.)

### Generate a cron secret

```bash
openssl rand -hex 32
```

Put it in `.env.local` as `CRON_SECRET`. The same value goes into Vercel project env vars later.

### Trigger the first sync

```bash
curl "http://localhost:3000/api/cron/sync?secret=$CRON_SECRET"
```

You should see `{"syncedGws":[1,2,...],"players":N}`. Open http://localhost:3000 — the dashboard now has data.

### Link yourself to your auth account

Sign in once via http://localhost:3000/login (magic link to your email). Then in the Supabase SQL Editor:

```sql
update players
set user_id = (select id from auth.users where email = 'you@example.com'),
    is_admin = true
where entry_id = <YOUR_FPL_ENTRY_ID>;
```

Repeat for each league member as they sign up (without `is_admin = true` unless they're an admin).

## Deploy

1. **Get the project to GitHub.** Easiest path with no git CLI: on github.com create a new private repo (don't initialise it with a README), then on the empty repo page click **"uploading an existing file"** and drag the contents of this folder in. **Important:** drop everything *except* `node_modules`, `.next`, `.env.local`, and `.vercel` (they're gitignored anyway, but the web uploader doesn't read `.gitignore`). Commit.

2. **Vercel** → New Project → import the GitHub repo. Framework auto-detects as Next.js.
3. Add the same env vars from `.env.local` to Vercel **Settings → Environment Variables**:
   - `LEAGUE_ID`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
4. Deploy. The first build will scaffold the cron schedule from `vercel.json` (`0 */6 * * *` — every 6 hours).
5. **Supabase Auth → URL Configuration**: add your Vercel URL (e.g. `https://your-app.vercel.app`) to the allowed redirect URLs so magic links work in production.

## Verification checklist

- [x] `npm test` (or `npx vitest run`) — pure scoring functions all pass
- [ ] Hit `/api/cron/sync?secret=...` locally, confirm `gameweek_results` rows in Supabase match a manual calculation for one GW
- [ ] Sign in three test users; confirm A can propose against B, B can't second their own, C can second
- [ ] Try to bypass via direct REST: `seconded_by = proposed_by` should be rejected by RLS + check constraint
- [ ] Flip your `is_admin` true; confirm `/admin` lets you void a proposal and it disappears from the dashboard
- [ ] Confirm the cron route returns 401 without the secret

## Project layout

```
app/
  page.tsx                # public dashboard (LOOGA LEGENDS)
  login/                  # magic link sign-in
  auth/callback/          # OAuth-ish code exchange
  propose/                # propose a gloat / missed report
  second/                 # rubber-stamp queue
  admin/                  # void / restore / edit names
  team/[entryId]/[gw]/    # public team viewer (any GW, any manager)
  api/cron/sync/          # Vercel Cron + manual trigger
lib/
  fpl.ts                  # typed FPL public API client
  scoring.ts              # pure functions (loser, below-avg, missed-report, format)
  scoring.test.ts         # vitest
  supabase/{server,client,admin}.ts
  db-types.ts             # hand-written DB types
proxy.ts                  # auth gate (Next.js 16 — formerly middleware.ts)
supabase/migrations/0001_init.sql
vercel.json               # cron schedule
```
