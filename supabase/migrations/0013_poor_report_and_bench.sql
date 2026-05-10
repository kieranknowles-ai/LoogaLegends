-- Two new things:
--
--   1. New fine kind 'poor_report' — admin-applied, £5 flat, requires a public reason.
--      Sits between 'gloat' (£1) and 'missed_report' (£10+). Mutually exclusive with
--      missed_report for the same (target, gw): a player either delivered, missed, or sub-par.
--
--   2. New column gameweek_results.points_on_bench — populated by the cron from
--      FplHistoryEvent.points_on_bench. Backfill: re-run /api/cron/sync?secret=...&force=1
--      after deploy to repopulate previous gameweeks (the cron will overwrite existing rows).

-- 1. poor_report kind
alter table fine_proposals drop constraint if exists fine_proposals_kind_check;
alter table fine_proposals
  add constraint fine_proposals_kind_check
    check (kind in ('gloat','missed_report','emoji','poor_report'));

-- Admin auto-applies poor_report (proposed_by == seconded_by), so it needs the same
-- exemption from the seconder/proposer + seconder/target checks as missed_report and emoji.
alter table fine_proposals drop constraint if exists fp_seconder_not_proposer;
alter table fine_proposals drop constraint if exists fp_seconder_not_target;
alter table fine_proposals
  add constraint fp_seconder_not_proposer
    check (kind in ('missed_report','emoji','poor_report') or seconded_by is null or seconded_by <> proposed_by),
  add constraint fp_seconder_not_target
    check (kind in ('missed_report','emoji','poor_report') or seconded_by is null or seconded_by <> target_entry);

-- gw is required for poor_report (it pertains to a specific GW's report).
alter table fine_proposals drop constraint if exists fp_gw_for_missed;
alter table fine_proposals
  add constraint fp_gw_for_missed
    check (kind in ('gloat','emoji') or gw is not null);

-- 2. bench points column
alter table gameweek_results
  add column if not exists points_on_bench int not null default 0;
