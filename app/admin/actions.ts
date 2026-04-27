"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { missedReportFineP } from "@/lib/scoring";

async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (!session.is_admin) throw new Error("Admin only.");
  return { session, admin: createAdminClient() };
}

/**
 * Toggle missed-report state for a (player, gw) pair.
 *
 * - If no row exists → create an applied missed_report (fine = base × 1.5^prior).
 * - If a non-voided row exists → void it (Mark changed mind, report was actually submitted).
 * - If a voided row exists → unvoid it (re-mark as missed, keep original fine_p).
 */
export async function toggleMissedReport(formData: FormData) {
  const { session, admin } = await requireAdmin();
  const targetEntry = Number(formData.get("target_entry"));
  const gw = Number(formData.get("gw"));

  if (!Number.isFinite(targetEntry)) throw new Error("Invalid target.");
  if (!Number.isFinite(gw) || gw < 1 || gw > 38) throw new Error("Invalid gameweek.");
  if (targetEntry === session.entry_id) throw new Error("Can't fine yourself.");

  // Look for an existing row for this (target, gw, missed_report).
  const { data: existing } = await admin
    .from("fine_proposals")
    .select("id, voided")
    .eq("kind", "missed_report")
    .eq("target_entry", targetEntry)
    .eq("gw", gw)
    .order("proposed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Toggle voided flag.
    const { error } = await admin
      .from("fine_proposals")
      .update({ voided: !existing.voided, voided_reason: existing.voided ? null : "toggled by admin" })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    // Fresh: count prior applied missed reports for the progression.
    const { count } = await admin
      .from("fine_proposals")
      .select("id", { count: "exact", head: true })
      .eq("kind", "missed_report")
      .eq("target_entry", targetEntry)
      .eq("voided", false)
      .not("seconded_at", "is", null);
    const fine_p = missedReportFineP(count ?? 0);
    const now = new Date().toISOString();
    const { error } = await admin.from("fine_proposals").insert({
      kind: "missed_report",
      target_entry: targetEntry,
      gw,
      fine_p,
      note: null,
      proposed_by: session.entry_id,
      seconded_by: session.entry_id,
      seconded_at: now,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

/** Form-based add (kept for non-grid use, e.g. retroactive entry with a note). */
export async function addMissedReport(formData: FormData) {
  const { session, admin } = await requireAdmin();
  const targetEntry = Number(formData.get("target_entry"));
  const gw = Number(formData.get("gw"));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!Number.isFinite(targetEntry)) throw new Error("Pick a target.");
  if (!Number.isFinite(gw) || gw < 1 || gw > 38) throw new Error("Pick a gameweek.");
  if (targetEntry === session.entry_id) throw new Error("Can't fine yourself.");

  // Count this player's prior applied missed reports → next-fine progression.
  const { count } = await admin
    .from("fine_proposals")
    .select("id", { count: "exact", head: true })
    .eq("kind", "missed_report")
    .eq("target_entry", targetEntry)
    .eq("voided", false)
    .not("seconded_at", "is", null);
  const fine_p = missedReportFineP(count ?? 0);

  const now = new Date().toISOString();
  const { error } = await admin.from("fine_proposals").insert({
    kind: "missed_report",
    target_entry: targetEntry,
    gw,
    fine_p,
    note,
    proposed_by: session.entry_id,
    seconded_by: session.entry_id, // admin is acting unilaterally
    seconded_at: now,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function voidProposal(formData: FormData) {
  const { admin } = await requireAdmin();
  const id = Number(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const { error } = await admin
    .from("fine_proposals")
    .update({ voided: true, voided_reason: reason })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function unvoidProposal(formData: FormData) {
  const { admin } = await requireAdmin();
  const id = Number(formData.get("id"));
  const { error } = await admin
    .from("fine_proposals")
    .update({ voided: false, voided_reason: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function setDisplayName(formData: FormData) {
  const { admin } = await requireAdmin();
  const entryId = Number(formData.get("entry_id"));
  const name = String(formData.get("display_name") ?? "").trim();
  if (!name) throw new Error("Name required.");
  const { error } = await admin.from("players").update({ display_name: name }).eq("entry_id", entryId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function setFirstName(formData: FormData) {
  const { admin } = await requireAdmin();
  const entryId = Number(formData.get("entry_id"));
  const first = String(formData.get("first_name") ?? "").trim().toLowerCase() || null;
  const { error } = await admin.from("players").update({ first_name: first }).eq("entry_id", entryId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function clearPassword(formData: FormData) {
  const { admin } = await requireAdmin();
  const entryId = Number(formData.get("entry_id"));
  const { error } = await admin.from("players").update({ password_hash: null }).eq("entry_id", entryId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}
