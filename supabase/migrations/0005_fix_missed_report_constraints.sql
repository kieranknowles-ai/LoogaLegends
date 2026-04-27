-- Admin-recorded missed reports set proposed_by = seconded_by = admin (unilateral act),
-- which violated the original CHECK constraints. Relax them so missed_report kind is exempt.

-- Drop the four auto-named CHECK constraints from migration 0001.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'fine_proposals'::regclass
      and contype = 'c'
      and conname like 'fine_proposals_check%'
  loop
    execute format('alter table fine_proposals drop constraint %I', c.conname);
  end loop;
end $$;

-- Re-add. Missed reports are exempt from the self/seconder rules because the admin
-- (currently Kieran) records them unilaterally. The kind-check and gloat-reason check
-- from earlier migrations stay in place under their own names.
alter table fine_proposals
  add constraint fp_no_self_gloat
    check (kind = 'missed_report' or proposed_by <> target_entry),
  add constraint fp_seconder_not_target
    check (kind = 'missed_report' or seconded_by is null or seconded_by <> target_entry),
  add constraint fp_seconder_not_proposer
    check (kind = 'missed_report' or seconded_by is null or seconded_by <> proposed_by),
  add constraint fp_gw_for_missed
    check (kind = 'gloat' or gw is not null);
