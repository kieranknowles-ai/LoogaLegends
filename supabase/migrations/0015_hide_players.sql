-- Hide players from the app without touching their real FPL league membership.
-- Their gameweek results still sync (harmless, ignored everywhere they're hidden)
-- so un-hiding later shows their full history straight away, no re-sync needed.
alter table players add column if not exists hidden boolean not null default false;
