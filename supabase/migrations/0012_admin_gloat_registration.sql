-- Admin-only gloat registration with explicit seconder.
-- Members no longer second each other's gloats; admins record proposer/seconder/target in one go
-- and the row arrives already-applied (seconded_by + seconded_at populated).
--
-- The real gate lives in the server action (uses createAdminClient which bypasses RLS), but we
-- update the policy too for defence-in-depth.

drop policy if exists "members can propose fines against others" on fine_proposals;

create policy "members can propose fines against others"
  on fine_proposals for insert to authenticated
  with check (
    proposed_by = current_entry_id()
    and target_entry <> current_entry_id()
    and voided = false
    and (
      -- Non-gloat path: members propose, seconding happens later (unchanged behaviour).
      (kind <> 'gloat' and seconded_by is null and seconded_at is null)
      or
      -- Gloat path: admin-only, must arrive already-seconded with a valid third-party seconder.
      (kind = 'gloat'
        and current_is_admin()
        and seconded_by is not null
        and seconded_at is not null
        and seconded_by <> proposed_by
        and seconded_by <> target_entry)
    )
  );

-- Cap the AI honeypot retroactively. The action now stops after the first click; this resets
-- anyone (notably Mark, who mashed it 27 times because there's no on-screen feedback) back to 1.
update players set ai_caught_count = 1 where ai_caught_count > 0;
