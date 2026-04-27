import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBootstrap, getEntryHistory, getLeagueStandings } from "@/lib/fpl";
import { computeGameweekFines } from "@/lib/scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
  const header = req.headers.get("authorization");
  if (header === `Bearer ${expected}`) return true;
  // Allow `?secret=` for manual hits during dev
  return req.nextUrl.searchParams.get("secret") === expected;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leagueId = Number(process.env.LEAGUE_ID);
  if (!Number.isFinite(leagueId)) {
    return NextResponse.json({ error: "LEAGUE_ID env var missing or invalid" }, { status: 500 });
  }

  const admin = createAdminClient();

  // 1. Pull league standings → upsert players
  const standings = await getLeagueStandings(leagueId);
  if (standings.length === 0) {
    return NextResponse.json({ error: "League returned no entries" }, { status: 500 });
  }

  const playerRows = standings.map((s) => ({
    entry_id: s.entry,
    display_name: s.player_name || s.entry_name || `Manager ${s.entry}`,
  }));
  // Upsert: insert if new, leave display_name alone for existing rows (admin may have edited).
  const { error: upsertError } = await admin
    .from("players")
    .upsert(playerRows, { onConflict: "entry_id", ignoreDuplicates: true });
  if (upsertError) {
    return NextResponse.json({ error: `players upsert: ${upsertError.message}` }, { status: 500 });
  }

  // 2. Find finished GWs we haven't synced yet
  const bootstrap = await getBootstrap();
  const finishedGws = bootstrap.events.filter((e) => e.finished).map((e) => e.id);
  if (finishedGws.length === 0) {
    return NextResponse.json({ syncedGws: [], message: "No finished GWs yet" });
  }

  const { data: existing } = await admin
    .from("gameweek_results")
    .select("gw")
    .in("gw", finishedGws);
  const synced = new Set((existing ?? []).map((r: { gw: number }) => r.gw));
  const todo = finishedGws.filter((gw) => !synced.has(gw)).sort((a, b) => a - b);

  if (todo.length === 0) {
    return NextResponse.json({ syncedGws: [], message: "Up to date" });
  }

  // 3. For each entry, fetch history once, then process all needed GWs
  const histories = await Promise.all(
    standings.map(async (s) => ({
      entry: s.entry,
      history: await getEntryHistory(s.entry),
    })),
  );

  const inserted: number[] = [];
  for (const gw of todo) {
    const event = bootstrap.events.find((e) => e.id === gw);
    if (!event) continue;
    const scores = histories
      .map(({ entry, history }) => {
        const evt = history.current.find((h) => h.event === gw);
        return evt ? { entryId: entry, points: evt.points } : null;
      })
      .filter((x): x is { entryId: number; points: number } => x !== null);

    if (scores.length === 0) continue;

    const breakdown = computeGameweekFines(scores, event.average_entry_score);
    const rows = breakdown.map((b) => ({
      gw,
      entry_id: b.entryId,
      points: b.points,
      national_average: event.average_entry_score,
      loser_fine_p: b.loserFineP,
      below_avg_fine_p: b.belowAvgFineP,
    }));

    const { error } = await admin
      .from("gameweek_results")
      .upsert(rows, { onConflict: "gw,entry_id" });
    if (error) {
      return NextResponse.json(
        { error: `gw ${gw} insert: ${error.message}`, syncedSoFar: inserted },
        { status: 500 },
      );
    }
    inserted.push(gw);
  }

  return NextResponse.json({ syncedGws: inserted, players: standings.length });
}
