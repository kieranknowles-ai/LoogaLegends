-- Snapshot the manager's bank balance and squad value at the end of each GW.
-- Both stored in tenths-of-a-million (FPL's native unit). 1000 = £100.0m.

alter table gameweek_results
  add column if not exists bank        int not null default 0,
  add column if not exists squad_value int not null default 0;
