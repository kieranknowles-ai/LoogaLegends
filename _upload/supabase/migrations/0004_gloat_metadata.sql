-- Gloats now carry a date (when it happened) and a categorisation.
alter table fine_proposals
  add column if not exists gloat_date   date,
  add column if not exists gloat_reason text;

-- Soft check: gloats either record a reason from the canonical list, or none at all (legacy).
alter table fine_proposals
  drop constraint if exists fine_proposals_gloat_reason_check;

alter table fine_proposals
  add constraint fine_proposals_gloat_reason_check
  check (
    gloat_reason is null
    or gloat_reason in (
      'general_arrogance',
      'league_position',
      'weekly_performance',
      'non_football'
    )
  );
