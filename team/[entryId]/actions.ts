"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BIO_LEN = 600;

export async function updateBio(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const targetEntry = Number(formData.get("entry_id"));
  if (!Number.isFinite(targetEntry)) throw new Error("Invalid entry.");
  if (targetEntry !== session.entry_id && !session.is_admin) {
    throw new Error("You can only edit your own bio.");
  }
  const raw = String(formData.get("bio") ?? "").trim();
  if (raw.length > MAX_BIO_LEN) {
    throw new Error(`Bio must be under ${MAX_BIO_LEN} characters.`);
  }
  const bio = raw || null;
  const admin = createAdminClient();
  const { error } = await admin.from("players").update({ bio }).eq("entry_id", targetEntry);
  if (error) throw new Error(error.message);
  revalidatePath(`/team/${targetEntry}`);
}
