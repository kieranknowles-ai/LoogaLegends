-- "Use AI to generate report" is a honeypot button. Anyone who clicks it has
-- their entry's counter incremented and lands in the public Hall of Shame.

alter table players add column if not exists ai_caught_count int not null default 0;
