-- Emoji fines. 50p per emoji used. Auto-applied (no seconding) — the offence is self-evident.

-- 1. Allow 'emoji' as a fine kind.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'fine_proposals'::regclass
      and contype = 'c'
      and conname like 'fine_proposals_kind_check%'
  loop
    execute format('alter table fine_proposals drop constraint %I', c.conname);
  end loop;
end $$;

alter table fine_proposals
  add constraint fine_proposals_kind_check
  check (kind in ('gloat','missed_report','emoji'));

-- 2. Record which emoji was used.
alter table fine_proposals add column if not exists emoji text;

-- 3. Adjust earlier CHECKs to include 'emoji' alongside 'missed_report'/'gloat' as appropriate.
alter table fine_proposals drop constraint if exists fp_no_self_gloat;
alter table fine_proposals drop constraint if exists fp_gw_for_missed;

alter table fine_proposals
  add constraint fp_no_self_gloat
    check (kind in ('missed_report','emoji') or proposed_by <> target_entry),
  add constraint fp_gw_for_missed
    check (kind in ('gloat','emoji') or gw is not null);
