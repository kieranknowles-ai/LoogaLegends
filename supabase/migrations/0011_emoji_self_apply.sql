-- Emoji fines auto-apply by the reporter (proposed_by == seconded_by, sometimes also == target_entry).
-- Migration 0005 only exempted 'missed_report' from the seconder constraints — emoji needs the same exemption.

alter table fine_proposals drop constraint if exists fp_seconder_not_proposer;
alter table fine_proposals drop constraint if exists fp_seconder_not_target;

alter table fine_proposals
  add constraint fp_seconder_not_proposer
    check (kind in ('missed_report','emoji') or seconded_by is null or seconded_by <> proposed_by),
  add constraint fp_seconder_not_target
    check (kind in ('missed_report','emoji') or seconded_by is null or seconded_by <> target_entry);
