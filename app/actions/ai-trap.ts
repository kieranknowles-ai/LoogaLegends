"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Honeypot. The "Use AI to generate report" button on the homepage triggers this.
 * Silently increments ai_caught_count for the logged-in user — no message, no
 * confirmation. Each click adds £5 to their fines and -10 to their gloating points
 * (computed at render time on the homepage; we only store the count here).
 */
export async function triggerAiTrap() {
  const session = await getSession();
  if (session) {
    const admin = createAdminClient();
    // Read-modify-write because Supabase REST doesn't expose atomic increment.
    const { data: row } = await admin
      .from("players")
      .select("ai_caught_count")
      .eq("entry_id", session.entry_id)
      .single();
    const next = (row?.ai_caught_count ?? 0) + 1;
    await admin.from("players").update({ ai_caught_count: next }).eq("entry_id", session.entry_id);
    revalidatePath("/");
  }
  redirect("/");
}
