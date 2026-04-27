"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function secondProposal(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?next=/second");

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id");

  const admin = createAdminClient();
  // Re-check the proposal here so the rules can't be bypassed by a forged form post.
  const { data: prop, error: fetchErr } = await admin
    .from("fine_proposals")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!prop) throw new Error("Proposal not found.");
  if (prop.voided) throw new Error("Already voided.");
  if (prop.seconded_at) throw new Error("Already seconded.");
  if (prop.target_entry === session.entry_id) throw new Error("Can't second a fine against yourself.");
  if (prop.proposed_by === session.entry_id) throw new Error("Can't second your own proposal.");

  const { error } = await admin
    .from("fine_proposals")
    .update({ seconded_by: session.entry_id, seconded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/second");
  revalidatePath("/");
}
