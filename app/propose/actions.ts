"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GLOAT_FINE_P } from "@/lib/scoring";
import { getBootstrap } from "@/lib/fpl";
import { GLOAT_REASON_LABELS, type GloatReason } from "@/lib/db-types";

const VALID_REASONS = Object.keys(GLOAT_REASON_LABELS) as GloatReason[];

/** Find the GW whose deadline_time is the latest <= the given date. */
async function gwForDate(dateIso: string): Promise<number | null> {
  try {
    const bootstrap = await getBootstrap();
    const target = new Date(dateIso).getTime();
    if (Number.isNaN(target)) return null;
    let best: number | null = null;
    for (const e of bootstrap.events) {
      if (new Date(e.deadline_time).getTime() <= target) best = e.id;
    }
    return best;
  } catch {
    return null;
  }
}

export async function proposeFine(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?next=/propose");

  const targetEntry = Number(formData.get("target_entry"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const gloatDate = String(formData.get("gloat_date") ?? "").trim();
  const reasonRaw = String(formData.get("gloat_reason") ?? "").trim();

  if (!Number.isFinite(targetEntry)) throw new Error("Pick a target.");
  if (targetEntry === session.entry_id) throw new Error("Can't fine yourself.");
  if (!gloatDate) throw new Error("Pick a date.");
  if (!VALID_REASONS.includes(reasonRaw as GloatReason)) throw new Error("Pick a reason.");

  const gw = await gwForDate(gloatDate);

  const admin = createAdminClient();
  const { error } = await admin.from("fine_proposals").insert({
    kind: "gloat",
    target_entry: targetEntry,
    gw,
    fine_p: GLOAT_FINE_P,
    note,
    proposed_by: session.entry_id,
    gloat_date: gloatDate,
    gloat_reason: reasonRaw,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/second");
  revalidatePath("/propose");
  redirect("/second");
}
