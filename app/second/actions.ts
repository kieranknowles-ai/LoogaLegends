"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function secondProposal(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id");

  const { data: me } = await supabase
    .from("players")
    .select("entry_id")
    .eq("user_id", user.id)
    .single();
  if (!me) throw new Error("You are not linked to a player.");

  // RLS + check constraints on fine_proposals enforce all the rules.
  const { error } = await supabase
    .from("fine_proposals")
    .update({ seconded_by: me.entry_id, seconded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/second");
  revalidatePath("/");
}
