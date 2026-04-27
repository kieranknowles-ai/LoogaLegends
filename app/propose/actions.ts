"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GLOAT_FINE_P } from "@/lib/scoring";

export async function proposeFine(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?next=/propose");

  const kind = String(formData.get("kind") ?? "");
  const targetEntry = Number(formData.get("target_entry"));
  const note = String(formData.get("note") ?? "").trim() || null;

  // Anyone can propose a gloat. Missed reports — Mark only (the league admin).
  if (kind !== "gloat") throw new Error("Only gloats can be proposed here. Missed reports go through admin.");
  if (!Number.isFinite(targetEntry)) throw new Error("Pick a target.");
  if (targetEntry === session.entry_id) throw new Error("Can't fine yourself.");

  const admin = createAdminClient();
  const { error } = await admin.from("fine_proposals").insert({
    kind: "gloat",
    target_entry: targetEntry,
    gw: null,
    fine_p: GLOAT_FINE_P,
    note,
    proposed_by: session.entry_id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/second");
  revalidatePath("/propose");
  redirect("/second");
}
