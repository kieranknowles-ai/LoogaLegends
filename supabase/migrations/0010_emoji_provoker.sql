-- Track who provoked an emoji crime — like an assist for the offence.
-- Optional, no fine for the provoker (yet); just metadata for now.

alter table fine_proposals
  add column if not exists provoked_by int references players(entry_id) on delete set null;
