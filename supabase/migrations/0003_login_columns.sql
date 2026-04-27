-- Switch from Supabase magic-link auth to first-name + password.
-- first_name = lowercase identifier the user types at login.
-- password_hash = scrypt-hashed password, set on first login. Wipe to NULL to reset.

alter table players
  add column if not exists first_name    text,
  add column if not exists password_hash text;

-- Seed first_name from display_name. Admin can amend rows where the FPL display name
-- differs from the manager's real first name (e.g. Graham → Sandy).
update players
set first_name = lower(split_part(display_name, ' ', 1))
where first_name is null;

create unique index if not exists players_first_name_idx
  on players (first_name)
  where first_name is not null;

-- Designate the missed-report admin. Mark Beaven gets the keys.
-- (Run this manually after first login if entry_id isn't known yet.)
-- update players set is_admin = true where lower(first_name) = 'mark';
