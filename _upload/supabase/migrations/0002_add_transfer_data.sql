-- Track transfer hits per GW so we can show where points went.
-- `points` in gameweek_results is already net of these (verified against FPL API).

alter table gameweek_results
  add column if not exists event_transfers      int not null default 0,
  add column if not exists event_transfers_cost int not null default 0;
