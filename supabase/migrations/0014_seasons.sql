-- New season support. Everything synced before today belongs to one undifferentiated
-- season; tag it '2025-26' and make room for '2026-27' onwards.
--
-- IMPORTANT: if your last season wasn't 2025-26, edit the backfill values below before
-- running this, and update lib/season.ts's CURRENT_SEASON to match what you're starting.

-- 1. gameweek_results: gw numbers reset every season (1-38), so season has to join the
--    primary key or this season's GW1 will collide with last season's GW1 on upsert.
alter table gameweek_results add column if not exists season text;
update gameweek_results set season = '2025-26' where season is null;
alter table gameweek_results alter column season set not null;
alter table gameweek_results alter column season set default '2026-27';

alter table gameweek_results drop constraint if exists gameweek_results_pkey;
alter table gameweek_results add primary key (season, gw, entry_id);

-- 2. fine_proposals: no PK change needed (id is already unique), season is just scoping
--    metadata so fine totals, missed-report escalation, and gloating-league scores reset
--    each year instead of accumulating forever.
alter table fine_proposals add column if not exists season text;
update fine_proposals set season = '2025-26' where season is null;
alter table fine_proposals alter column season set not null;
alter table fine_proposals alter column season set default '2026-27';

-- Helpful for the season toggle / league-history queries.
create index if not exists gameweek_results_season_idx on gameweek_results (season);
create index if not exists fine_proposals_season_idx on fine_proposals (season);

-- applied_fines is a view over fine_proposals — season column comes through automatically,
-- no need to recreate it.
