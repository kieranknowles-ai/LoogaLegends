"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GLOAT_FINE_P } from "@/lib/scoring";
import { getBootstrap } from "@/lib/fpl";
import { COMMON_EMOJIS, EMOJI_FINE_P, GLOAT_REASON_LABELS, type GloatReason } from "@/lib/db-types";

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
  redirect("/");
}

/**
 * Emoji fines auto-apply. Reporter picks the perpetrator and date.
 * Selecting an offending emoji from the palette is OPTIONAL — but if the reporter
 * picks one, they also get fined £0.50 themselves, because using an emoji to report
 * an emoji is, itself, a crime. The home page surfaces the "no need for the emoji"
 * reveal via a flash banner on ?caught_emoji=1.
 */
export async function proposeEmoji(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?next=/propose");

  const targetEntry = Number(formData.get("target_entry"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const offenceDate = String(formData.get("offence_date") ?? "").trim();
  const emojiRaw = String(formData.get("emoji") ?? "").trim();
  const reporterUsedEmoji = emojiRaw && COMMON_EMOJIS.includes(emojiRaw);
  const emoji = reporterUsedEmoji ? emojiRaw : null;

  if (!Number.isFinite(targetEntry)) throw new Error("Pick the perpetrator.");
  if (!offenceDate) throw new Error("Pick a date.");

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Always fine the perpetrator.
  const rows = [
    {
      kind: "emoji",
      target_entry: targetEntry,
      gw: null,
      fine_p: EMOJI_FINE_P,
      note,
      proposed_by: session.entry_id,
      seconded_by: session.entry_id,
      seconded_at: now,
      gloat_date: offenceDate,
      emoji,
    },
  ];

  // The trap: if the reporter picked an emoji, fine the reporter too.
  if (reporterUsedEmoji) {
    rows.push({
      kind: "emoji",
      target_entry: session.entry_id,
      gw: null,
      fine_p: EMOJI_FINE_P,
      note: `Used ${emojiRaw} while reporting an emoji crime. There's no need for the emoji!`,
      proposed_by: session.entry_id,
      seconded_by: session.entry_id,
      seconded_at: now,
      gloat_date: offenceDate,
      emoji: emojiRaw,
    });
  }

  const { error } = await admin.from("fine_proposals").insert(rows);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/propose");
  redirect(reporterUsedEmoji ? "/?caught_emoji=1" : "/");
}
