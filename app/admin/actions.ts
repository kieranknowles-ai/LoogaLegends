"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("players")
    .select("entry_id, is_admin")
    .eq("user_id", user.id)
    .single();
  if (!me?.is_admin) throw new Error("Admin only.");
  return supabase;
}

export async function voidProposal(formData: FormData) {
  const supabase = await requireAdmin();
  const id = Number(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const { error } = await supabase
    .from("fine_proposals")
    .update({ voided: true, voided_reason: reason })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function unvoidProposal(formData: FormData) {
  const supabase = await requireAdmin();
  const id = Number(formData.get("id"));
  const { error } = await supabase
    .from("fine_proposals")
    .update({ voided: false, voided_reason: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function setDisplayName(formData: FormData) {
  const supabase = await requireAdmin();
  const entryId = Number(formData.get("entry_id"));
  const name = String(formData.get("display_name") ?? "").trim();
  if (!name) throw new Error("Name required.");
  const { error } = await supabase
    .from("players")
    .update({ display_name: name })
    .eq("entry_id", entryId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}
