-- Manager-editable bio (free text, nullable). Edited via the manager dossier page.
alter table players add column if not exists bio text;
