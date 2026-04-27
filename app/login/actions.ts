"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassword, setSession, verifyPassword, clearSession } from "@/lib/auth";

export async function login(formData: FormData) {
  const nameInput = String(formData.get("first_name") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  if (!nameInput) throw new Error("Type your first name.");
  if (!password) throw new Error("Type a password.");
  if (password.length < 4) throw new Error("Password must be at least 4 characters.");

  const admin = createAdminClient();
  const { data: player, error } = await admin
    .from("players")
    .select("entry_id, first_name, display_name, password_hash")
    .eq("first_name", nameInput)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!player) throw new Error(`No player called "${nameInput}". Check spelling, or ask Kieran to add you.`);

  if (player.password_hash === null) {
    // First login — set the password they just typed.
    const newHash = hashPassword(password);
    const { error: upErr } = await admin
      .from("players")
      .update({ password_hash: newHash })
      .eq("entry_id", player.entry_id);
    if (upErr) throw new Error(upErr.message);
  } else {
    // Existing user — must match.
    if (!verifyPassword(password, player.password_hash)) {
      throw new Error("Wrong password. Ask Kieran to clear it in Supabase if you're stuck.");
    }
  }

  await setSession(player.entry_id);
  redirect(next);
}

export async function logout() {
  await clearSession();
  redirect("/");
}
