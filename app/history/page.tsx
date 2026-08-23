import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatGbp } from "@/lib/scoring";
import { CURRENT_SEASON } from "@/lib/season";
import type { GameweekResult, FineProposal, Player } from "@/lib/db-types";

export const dynamic = "force-dynamic";

type Row = {
  entryId: number;
  displayName: string;
  totalPoints: number;
  totalFinesP: number;
  loserP: number;
  belowAvgP: number;
  gloatsP: number;
  otherP: number;
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const supabase = createAdminClient();

  // Every season that isn't the current one, most recent first.
  const { data: seasonRows } = await supabase
    .from("gameweek_results")
    .select("season")
    .neq("season", CURRENT_SEASON);
  const seasons = Array.from(new Set((seasonRows ?? []).map((r: { season: string }) => r.season))).sort(
    (a, b) => b.localeCompare(a),
  );

  if (seasons.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="kicker">Standby</div>
        <h1 className="headline text-5xl mt-3">No history yet, guv.</h1>
        <p className="mt-3 italic text-ink/70">
          Nothing from a previous season is stored yet — check back once {CURRENT_SEASON} rolls over.
        </p>
      </div>
    );
  }

  const { season: seasonParam } = await searchParams;
  const season = seasonParam && seasons.includes(seasonParam) ? seasonParam : seasons[0];

  const [{ data: players }, { data: gws }, { data: fines }] = await Promise.all([
    supabase.from("players").select("entry_id, display_name, hidden"),
    supabase.from("gameweek_results").select("*").eq("season", season),
    supabase.from("applied_fines").select("*").eq("season", season),
  ]);

  const allPlayers = (players as (Player & { hidden: boolean })[] | null) ?? [];
  const playerMap = new Map(allPlayers.map((p) => [p.entry_id, p.display_name]));
  const hiddenIds = new Set(allPlayers.filter((p) => p.hidden).map((p) => p.entry_id));
  const gwResults = (gws ?? []) as GameweekResult[];
  const finesForSeason = (fines ?? []) as FineProposal[];

  const byEntry = new Map<number, Row>();
  const ensure = (entryId: number): Row | null => {
    if (hiddenIds.has(entryId)) return null;
    let r = byEntry.get(entryId);
    if (!r) {
      r = {
        entryId,
        displayName: playerMap.get(entryId) ?? `#${entryId}`,
        totalPoints: 0,
        totalFinesP: 0,
        loserP: 0,
        belowAvgP: 0,
        gloatsP: 0,
        otherP: 0,
      };
      byEntry.set(entryId, r);
    }
    return r;
  };

  for (const g of gwResults) {
    const r = ensure(g.entry_id);
    if (!r) continue;
    r.totalPoints += g.points;
    r.loserP += g.loser_fine_p;
    r.belowAvgP += g.below_avg_fine_p;
    r.totalFinesP += g.loser_fine_p + g.below_avg_fine_p;
  }
  for (const f of finesForSeason) {
    const r = ensure(f.target_entry);
    if (!r) continue;
    r.totalFinesP += f.fine_p;
    if (f.kind === "gloat") r.gloatsP += f.fine_p;
    else r.otherP += f.fine_p;
  }

  const rankedByPoints = [...byEntry.values()].sort((a, b) => b.totalPoints - a.totalPoints);
  const rankedByFines = [...byEntry.values()].sort((a, b) => b.totalFinesP - a.totalFinesP);
  const totalPotP = [...byEntry.values()].reduce((sum, r) => sum + r.totalFinesP, 0);
  const champion = rankedByPoints[0];
  const easyThirdEntry = rankedByPoints[2]?.entryId;

  return (
    <div className="space-y-8">
      <section>
        <div className="kicker text-xs">Archive</div>
        <h1 className="headline text-5xl md:text-7xl mt-2">
          LEAGUE <span className="text-tabloid">HISTORY</span>
        </h1>
        {champion && (
          <p className="mt-2 text-lg italic">
            {season} champion: <strong className="text-tabloid">{champion.displayName}</strong> ·
            Total pot that season: <strong>{formatGbp(totalPotP)}</strong>
          </p>
        )}
      </section>

      <nav className="flex gap-2 flex-wrap">
        {seasons.map((s) => (
          <Link
            key={s}
            href={`/history?season=${s}`}
            className={`px-4 py-2 border-3 border-ink uppercase font-bold text-sm tracking-widest ${
              s === season ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-bargain"
            }`}
          >
            {s}
          </Link>
        ))}
      </nav>

      <section>
        <h2 className="headline text-3xl mb-3">
          <span className="kicker">{season}</span> LEAGUE TABLE
        </h2>

        {/* MOBILE: card stack */}
        <div className="md:hidden space-y-2">
          {rankedByPoints.map((r, i) => {
            const isEasyThird = r.entryId === easyThirdEntry;
            return (
              <div key={r.entryId} className={`card p-3 ${isEasyThird ? "bg-bargain" : ""}`}>
                <div className="flex justify-between items-baseline gap-2">
                  <div>
                    <span className="font-display text-xl mr-2">{isEasyThird ? "🏆" : i + 1}</span>
                    <Link href={`/team/${r.entryId}`} className="underline decoration-tabloid decoration-2 underline-offset-2 font-bold">
                      {r.displayName}
                    </Link>
                  </div>
                  <span className="font-display text-2xl tabular-nums">{r.totalPoints}</span>
                </div>
                {isEasyThird && (
                  <div className="mt-1"><span className="shock text-[11px]">★ EASY THIRD ★ Picked the venue</span></div>
                )}
                <div className="text-xs mt-1 text-ink/70">Owed that season: {formatGbp(r.totalFinesP)}</div>
              </div>
            );
          })}
        </div>

        {/* DESKTOP: table */}
        <div className="card overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper uppercase text-xs">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Manager</th>
                <th className="px-3 py-2 text-right">Total points</th>
                <th className="px-3 py-2 text-right text-ink/60">Owed</th>
              </tr>
            </thead>
            <tbody>
              {rankedByPoints.map((r, i) => {
                const isEasyThird = r.entryId === easyThirdEntry;
                return (
                  <tr
                    key={r.entryId}
                    className={`border-t border-ink/20 ${isEasyThird ? "bg-bargain border-y-4 border-ink" : "hover:bg-bargain/30"}`}
                  >
                    <td className={`px-3 py-2 font-display text-lg ${isEasyThird ? "text-2xl" : ""}`}>
                      {isEasyThird ? "🏆" : i + 1}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/team/${r.entryId}`} className="underline decoration-tabloid decoration-2 underline-offset-2">
                        {r.displayName}
                      </Link>
                      {isEasyThird && (
                        <div className="mt-1">
                          <span className="shock text-[11px]">★ EASY THIRD ★ Picked the venue</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{r.totalPoints}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink/60">{formatGbp(r.totalFinesP)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="headline text-3xl mb-3">
          <span className="shock">SHAME</span> LEADERBOARD — {season}
        </h2>

        {/* MOBILE: card stack */}
        <div className="md:hidden space-y-2">
          {rankedByFines.map((r, i) => (
            <div key={r.entryId} className="card p-3">
              <div className="flex justify-between items-baseline gap-2">
                <div>
                  <span className="font-display text-xl mr-2">{i + 1}</span>
                  <Link href={`/team/${r.entryId}`} className="underline decoration-tabloid decoration-2 underline-offset-2 font-bold">
                    {r.displayName}
                  </Link>
                </div>
                <span className="font-display text-2xl tabular-nums text-tabloid">{formatGbp(r.totalFinesP)}</span>
              </div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs mt-2 text-ink/70">
                <div>Loser: <strong>{formatGbp(r.loserP)}</strong></div>
                <div>Below avg: <strong>{formatGbp(r.belowAvgP)}</strong></div>
                <div>Gloats: <strong>{formatGbp(r.gloatsP)}</strong></div>
              </div>
            </div>
          ))}
        </div>

        {/* DESKTOP: table */}
        <div className="card overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper uppercase text-xs">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Manager</th>
                <th className="px-3 py-2 text-right">Loser fines</th>
                <th className="px-3 py-2 text-right">Below avg</th>
                <th className="px-3 py-2 text-right">Gloats</th>
                <th className="px-3 py-2 text-right">Other</th>
                <th className="px-3 py-2 text-right">Owed</th>
              </tr>
            </thead>
            <tbody>
              {rankedByFines.map((r, i) => (
                <tr key={r.entryId} className="border-t border-ink/20 hover:bg-bargain/30">
                  <td className="px-3 py-2 font-display text-lg">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link href={`/team/${r.entryId}`} className="underline decoration-tabloid decoration-2 underline-offset-2">
                      {r.displayName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatGbp(r.loserP)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatGbp(r.belowAvgP)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatGbp(r.gloatsP)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatGbp(r.otherP)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{formatGbp(r.totalFinesP)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
