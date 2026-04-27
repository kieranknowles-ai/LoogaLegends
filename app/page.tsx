import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buyInPenceFromTotalPot, formatGbp, GLOAT_FINE_P } from "@/lib/scoring";
import type { GameweekResult, Player, FineProposal } from "@/lib/db-types";

export const dynamic = "force-dynamic";

type PlayerRow = Pick<Player, "entry_id" | "display_name">;

type Aggregate = {
  player: PlayerRow;
  loserP: number;
  belowAvgP: number;
  gloatsP: number;
  missedP: number;
  totalP: number;
  totalPoints: number;
  latestGwPoints: number | null;
};

type View = "fines" | "points";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: viewParam } = await searchParams;
  const view: View = viewParam === "points" ? "points" : "fines";

  const supabase = await createClient();

  const [{ data: players }, { data: gws }, { data: applied }] = await Promise.all([
    supabase.from("players").select("entry_id, display_name").order("display_name"),
    supabase.from("gameweek_results").select("*"),
    supabase.from("applied_fines").select("*"),
  ]);

  if (!players || players.length === 0) {
    return <EmptyState />;
  }

  const gwResults = (gws ?? []) as GameweekResult[];
  const fines = (applied ?? []) as FineProposal[];

  const latestGw = gwResults.reduce((max, r) => Math.max(max, r.gw), 0);

  const byEntry = new Map<number, Aggregate>(
    players.map((p) => [
      p.entry_id,
      {
        player: p,
        loserP: 0,
        belowAvgP: 0,
        gloatsP: 0,
        missedP: 0,
        totalP: 0,
        totalPoints: 0,
        latestGwPoints: null,
      },
    ]),
  );

  for (const r of gwResults) {
    const a = byEntry.get(r.entry_id);
    if (!a) continue;
    a.loserP += r.loser_fine_p;
    a.belowAvgP += r.below_avg_fine_p;
    a.totalPoints += r.points;
    if (r.gw === latestGw) a.latestGwPoints = r.points;
  }
  for (const f of fines) {
    const a = byEntry.get(f.target_entry);
    if (!a) continue;
    if (f.kind === "gloat") a.gloatsP += f.fine_p;
    else a.missedP += f.fine_p;
  }
  for (const a of byEntry.values()) {
    a.totalP = a.loserP + a.belowAvgP + a.gloatsP + a.missedP;
  }

  const all = [...byEntry.values()];
  const rankedByFines = [...all].sort((a, b) => b.totalP - a.totalP);
  const rankedByPoints = [...all].sort((a, b) => b.totalPoints - a.totalPoints);

  const totalPotP = all.reduce((sum, a) => sum + a.totalP, 0);
  const buyInP = buyInPenceFromTotalPot(totalPotP, players.length);

  const latestRows = gwResults.filter((r) => r.gw === latestGw);
  const latestWinner = latestRows.reduce<GameweekResult | null>(
    (best, r) => (best && best.points >= r.points ? best : r),
    null,
  );
  const latestLoser = latestRows.reduce<GameweekResult | null>(
    (worst, r) => (worst && worst.points <= r.points ? worst : r),
    null,
  );
  const latestBelowAvg = latestRows.filter((r) => r.below_avg_fine_p > 0);
  const nameOf = (entryId: number) => byEntry.get(entryId)?.player.display_name ?? `#${entryId}`;

  const easyThirdEntry = rankedByPoints[2]?.player.entry_id;

  return (
    <div className="space-y-8">
      {/* HERO */}
      <section>
        <div className="kicker text-xs">Gameweek {latestGw || "—"} · Exclusive</div>
        <h1 className="headline text-6xl md:text-8xl mt-2">
          LOOGA <span className="text-tabloid">LEGENDS</span>
        </h1>
        <p className="mt-2 text-lg italic">
          Total pot: <strong className="text-tabloid">{formatGbp(totalPotP)}</strong> ·
          Night-out buy-in: <strong>{formatGbp(buyInP)}</strong> per non-player ·
          Gloat tariff: <strong>{formatGbp(GLOAT_FINE_P)}</strong>
        </p>
      </section>

      {/* LATEST GW */}
      {latestGw > 0 && latestWinner && latestLoser && (
        <section className="card p-5">
          <div className="kicker">This week — GW {latestGw}</div>
          <div className="grid md:grid-cols-3 gap-4 mt-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-ink/60">Top of the table</div>
              <div className="headline text-3xl">{nameOf(latestWinner.entry_id)}</div>
              <div className="text-sm">{latestWinner.points} pts</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-ink/60">Bottom of the bin</div>
              <div className="headline text-3xl text-tabloid">{nameOf(latestLoser.entry_id)}</div>
              <div className="text-sm">
                {latestLoser.points} pts · owes {formatGbp(latestLoser.loser_fine_p)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-ink/60">National average</div>
              <div className="headline text-3xl">{latestRows[0]?.national_average ?? "—"}</div>
              <div className="text-sm">
                {latestBelowAvg.length} player{latestBelowAvg.length === 1 ? "" : "s"} below
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TABS */}
      <section>
        <div className="flex gap-2 mb-3">
          <Link
            href="/?view=points"
            className={`px-4 py-2 border-3 border-ink uppercase font-bold text-sm tracking-widest ${
              view === "points" ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-bargain"
            }`}
          >
            League table
          </Link>
          <Link
            href="/?view=fines"
            className={`px-4 py-2 border-3 border-ink uppercase font-bold text-sm tracking-widest ${
              view === "fines" ? "bg-tabloid text-paper" : "bg-paper text-ink hover:bg-bargain"
            }`}
          >
            Shame leaderboard
          </Link>
        </div>

        {view === "points" ? (
          <>
            <h2 className="headline text-3xl mb-3">
              <span className="kicker">League</span> TABLE
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink text-paper uppercase text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Manager</th>
                    <th className="px-3 py-2 text-right">GW {latestGw}</th>
                    <th className="px-3 py-2 text-right">Total points</th>
                    <th className="px-3 py-2 text-right text-ink/60">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedByPoints.map((a, i) => (
                    <tr key={a.player.entry_id} className="border-t border-ink/20 hover:bg-bargain/30">
                      <td className="px-3 py-2 font-display text-lg">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/team/${a.player.entry_id}/${latestGw || 1}`}
                          className="underline decoration-tabloid decoration-2 underline-offset-2"
                        >
                          {a.player.display_name}
                        </Link>
                        {a.player.entry_id === easyThirdEntry && (
                          <span className="ml-2 shock text-[10px]">Easy 3rd · venue picker</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.latestGwPoints ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{a.totalPoints}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink/60">{formatGbp(a.totalP)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <h2 className="headline text-3xl mb-3">
              <span className="shock">SHAME</span> LEADERBOARD
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink text-paper uppercase text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Manager</th>
                    <th className="px-3 py-2 text-right">Loser fines</th>
                    <th className="px-3 py-2 text-right">Below avg</th>
                    <th className="px-3 py-2 text-right">Gloats</th>
                    <th className="px-3 py-2 text-right">Missed reports</th>
                    <th className="px-3 py-2 text-right">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedByFines.map((a, i) => (
                    <tr key={a.player.entry_id} className="border-t border-ink/20 hover:bg-bargain/30">
                      <td className="px-3 py-2 font-display text-lg">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/team/${a.player.entry_id}/${latestGw || 1}`}
                          className="underline decoration-tabloid decoration-2 underline-offset-2"
                        >
                          {a.player.display_name}
                        </Link>
                        {a.player.entry_id === easyThirdEntry && (
                          <span className="ml-2 shock text-[10px]">Easy 3rd · venue picker</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatGbp(a.loserP)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatGbp(a.belowAvgP)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatGbp(a.gloatsP)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatGbp(a.missedP)}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">
                        {formatGbp(a.totalP)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card p-5 bg-bargain">
        <div className="kicker">Want to dish it out?</div>
        <p className="mt-2 text-sm">
          Spotted a gloat in the chat? Missed report? Hit{" "}
          <Link href="/propose" className="underline font-bold">propose</Link> — but remember,
          you can&apos;t fine yourself, and another member has to <Link href="/second" className="underline font-bold">second</Link> it
          before the fine sticks. Target can&apos;t second their own.
        </p>
      </section>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-8 text-center">
      <div className="kicker">Standby</div>
      <h1 className="headline text-5xl mt-3">No data yet, guv.</h1>
      <p className="mt-3 italic text-ink/70">
        The cron sync hasn&apos;t pulled the league standings. Set up your <code>.env.local</code>,
        run the migration in Supabase, and hit <code>/api/cron/sync</code>.
      </p>
    </div>
  );
}
