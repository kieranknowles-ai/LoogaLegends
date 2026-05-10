"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Honeypot. The "Use AI to generate report" button on the homepage triggers this.
 * Silently flips ai_caught_count to 1 for the logged-in user — no message, no
 * confirmation. Capped at 1 because the button gives no feedback and a curious
 * tester (hi Mark) can mash it dozens of times before realising they're being fined.
 */
export async function triggerAiTrap() {
  const session = await getSession();
  if (session) {
    const admin = createAdminClient();
    const { data: row } = await admin
      .from("players")
      .select("ai_caught_count")
      .eq("entry_id", session.entry_id)
      .single();
    if ((row?.ai_caught_count ?? 0) === 0) {
      await admin.from("players").update({ ai_caught_count: 1 }).eq("entry_id", session.entry_id);
    }
    revalidatePath("/");
  }
  redirect("/");
}
