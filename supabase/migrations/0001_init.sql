-- Custom-rules FPL league dashboard
-- All money stored in pence (int) to avoid float drift.

create table players (
  entry_id      int primary key,
  user_id       uuid unique references auth.users(id) on delete set null,
  display_name  text not null,
  is_admin      boolean not null default false,
  joined_at     timestamptz not null default now()
);

create table gameweek_results (
  gw                int not null,
  entry_id          int not null references players(entry_id) on delete cascade,
  points            int not null,
  national_average  int not null,
  loser_fine_p      int not null default 0,
  below_avg_fine_p  int not null default 0,
  primary key (gw, entry_id)
);

create table fine_proposals (
  id              bigserial primary key,
  kind            text not null check (kind in ('gloat','missed_report')),
  target_entry    int not null references players(entry_id) on delete cascade,
  gw              int,
  fine_p          int not null,
  note            text,
  proposed_by     int not null references players(entry_id) on delete cascade,
  proposed_at     timestamptz not null default now(),
  seconded_by     int references players(entry_id) on delete set null,
  seconded_at     timestamptz,
  voided          boolean not null default false,
  voided_reason   text,
  check (proposed_by <> target_entry),
  check (seconded_by is null or seconded_by <> target_entry),
  check (seconded_by is null or seconded_by <> proposed_by),
  check (kind = 'gloat' or gw is not null)
);

create index fine_proposals_pending_idx
  on fine_proposals (proposed_at)
  where seconded_at is null and not voided;

create index fine_proposals_target_idx
  on fine_proposals (target_entry)
  where not voided;

create view applied_fines as
  select * from fine_proposals where seconded_at is not null and not voided;

-- helper: returns the calling user's mapped entry_id, or null
create or replace function current_entry_id() returns int
language sql stable security definer as $$
  select entry_id from players where user_id = auth.uid()
$$;

create or replace function current_is_admin() returns boolean
language sql stable security definer as $$
  select coalesce(
    (select is_admin from players where user_id = auth.uid()),
    false
  )
$$;

-- RLS
alter table players enable row level security;
alter table gameweek_results enable row level security;
alter table fine_proposals enable row level security;

-- players: public read; only the user themselves (or admin) can update display_name; insert restricted to service role (cron)
create policy "players are publicly readable"
  on players for select using (true);

create policy "users can update their own display_name"
  on players for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_admin = (select is_admin from players p where p.entry_id = players.entry_id));

create policy "admins can update any player"
  on players for update to authenticated
  using (current_is_admin())
  with check (current_is_admin());

-- gameweek_results: public read; writes only via service_role (cron)
create policy "gameweek_results are publicly readable"
  on gameweek_results for select using (true);

-- fine_proposals: any authenticated user can read; carefully gated insert/update; admin override
create policy "fine_proposals readable by authenticated"
  on fine_proposals for select to authenticated using (true);

-- Public dashboard reads via the applied_fines view (RLS still applies to underlying table).
-- We allow public read of *applied* (seconded, non-voided) fines:
create policy "applied fines are publicly readable"
  on fine_proposals for select
  using (seconded_at is not null and not voided);

create policy "members can propose fines against others"
  on fine_proposals for insert to authenticated
  with check (
    proposed_by = current_entry_id()
    and target_entry <> current_entry_id()
    and seconded_by is null
    and seconded_at is null
    and voided = false
  );

create policy "members can second others' proposals"
  on fine_proposals for update to authenticated
  using (
    seconded_at is null
    and not voided
    and target_entry <> current_entry_id()
    and proposed_by <> current_entry_id()
  )
  with check (
    seconded_by = current_entry_id()
    and seconded_at is not null
    and voided = false
  );

create policy "admins can void proposals"
  on fine_proposals for update to authenticated
  using (current_is_admin())
  with check (current_is_admin());

-- Trigger: auto-link a fresh auth user to their player row by email match.
-- The cron job populates players first; when a user signs up with the matching email, link them.
-- (Email is in auth.users.email; player rows don't store email — admin claims happen manually.)
-- Skipped automatic trigger: the admin will bind user_id manually via SQL or admin UI on first login.
