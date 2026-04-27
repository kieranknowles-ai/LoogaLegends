"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GLOAT_FINE_P, missedReportFineP } from "@/lib/scoring";

export async function proposeFine(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const kind = String(formData.get("kind") ?? "");
  const targetEntry = Number(formData.get("target_entry"));
  const gwRaw = formData.get("gw");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (kind !== "gloat" && kind !== "missed_report") {
    throw new Error("Invalid kind");
  }
  if (!Number.isFinite(targetEntry)) {
    throw new Error("Invalid target");
  }
  const gw = gwRaw === null || gwRaw === "" ? null : Number(gwRaw);
  if (kind === "missed_report" && (gw === null || !Number.isFinite(gw))) {
    throw new Error("Missed report requires a gameweek");
  }

  // Find the proposer's entry
  const { data: me } = await supabase
    .from("players")
    .select("entry_id")
    .eq("user_id", user.id)
    .single();
  if (!me) throw new Error("You are not linked to a player. Ask the admin.");
  if (me.entry_id === targetEntry) throw new Error("Can't fine yourself.");

  let fine_p = GLOAT_FINE_P;
  if (kind === "missed_report") {
    // Count target's prior applied missed reports (admin client to bypass RLS for the count)
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("fine_proposals")
      .select("id", { count: "exact", head: true })
      .eq("kind", "missed_report")
      .eq("target_entry", targetEntry)
      .eq("voided", false)
      .not("seconded_at", "is", null);
    if (error) throw error;
    fine_p = missedReportFineP(count ?? 0);
  }

  const { error } = await supabase.from("fine_proposals").insert({
    kind,
    target_entry: targetEntry,
    gw,
    fine_p,
    note,
    proposed_by: me.entry_id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/second");
  revalidatePath("/propose");
  redirect("/second");
}
