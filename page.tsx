import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { buyInPenceFromTotalPot, formatGbp, GLOAT_FINE_P } from "@/lib/scoring";
import { getSession } from "@/lib/auth";
import { secondProposal } from "./second/actions";
import { triggerAiTrap } from "./actions/ai-trap";
import { GLOAT_REASON_LABELS, type GameweekResult, type Player, type FineProposal } from "@/lib/db-types";

const AI_FINE_P = 500; // £5 per click
const AI_GLOAT_PENALTY = -10; // per click

export const dynamic = "force-dynamic";

type PlayerRow = Pick<Player, "entry_id" | "display_name" | "ai_caught_count">;

type Aggregate = {
  player: PlayerRow;
  loserP: number;
  belowAvgP: number;
  gloatsP: number;
  missedP: number;
  emojiP: number;
  aiP: number;
  totalP: number;
  totalPoints: number;
  latestGwPoints: number | null;
  totalHitsCost: number;
  latestGwHitsCost: number;
  weeksWithNegativePoints: number;
  latestGwWentNegative: boolean;
  // Gloating league
  proposalsMade: number;
  proposalsLanded: number;
  secondingsMade: number;
  gloatsAgainst: number;
  gotAway: number;
  gotCaught: number;
  gloatPoints: number;
  // Bank — latest GW values, in 0.1m units
  bank: number;
  squadValue: number;
};

type View = "fines" | "points" | "gloating" | "momentum" | "bank";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MOMENTUM_WINDOW = 10;

type MomentumRow = {
  player: PlayerRow;
  ranks: (number | null)[];
  avgRank: number;
  trend: "up" | "down" | "flat";
};

function Sparkline({ values, players }: { values: (number | null)[]; players: number }) {
  const W = 100;
  const H = 28;
  const P = 3;
  const n = values.length;
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(n - 1, 1);
  const y = (v: number) => P + ((v - 1) * (H - 2 * P)) / Math.max(players - 1, 1);

  // Build polyline path with breaks for nulls.
  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    } else {
      current.push(`${current.length === 0 ? "M" : "L"} ${x(i)} ${y(v)}`);
    }
  });
  if (current.length) segments.push(current.join(" "));

  const lastIdx = (() => {
    for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return i;
    return -1;
  })();
  const lastVal = lastIdx >= 0 ? values[lastIdx] : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-24 h-7" role="img">
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
      <line x1={P} y1={P} x2={W - P} y2={P} stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
      <path d={segments.join(" ")} fill="none" stroke="#0a0a0a" strokeWidth="1.5" strokeLinejoin="round" />
      {values.map((v, i) =>
        v == null ? null : (
          <circle key={i} cx={x(i)} cy={y(v)} r="1.5" fill="#0a0a0a" />
        ),
      )}
      {lastVal != null && (
        <circle cx={x(lastIdx)} cy={y(lastVal)} r="3" fill="#c8102e" />
      )}
    </svg>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; caught_emoji?: string }>;
}) {
  const { view: viewParam, caught_emoji: caughtEmoji } = await searchParams;
  const view: View =
    viewParam === "points"
      ? "points"
      : viewParam === "gloating"
      ? "gloating"
      : viewParam === "momentum"
      ? "momentum"
      : viewParam === "bank"
      ? "bank"
      : "fines";

  const supabase = createAdminClient();
  const session = await getSession();

  const [{ data: players }, { data: gws }, { data: applied }, { data: allGloats }, { data: pending }, { data: emojiLog }] = await Promise.all([
    supabase.from("players").select("entry_id, display_name, ai_caught_count").order("display_name"),
    supabase.from("gameweek_results").select("*"),
    supabase.from("applied_fines").select("*"),
    supabase
      .from("fine_proposals")
      .select("*")
      .eq("kind", "gloat")
      .eq("voided", false),
    supabase
      .from("fine_proposals")
      .select("*")
      .eq("kind", "gloat")
      .eq("voided", false)
      .is("seconded_at", null)
      .order("proposed_at", { ascending: false }),
    supabase
      .from("fine_proposals")
      .select("*")
      .eq("kind", "emoji")
      .eq("voided", false)
      .order("proposed_at", { ascending: false })
      .limit(50),
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
        emojiP: 0,
        aiP: 0,
        totalP: 0,
        totalPoints: 0,
        latestGwPoints: null,
        totalHitsCost: 0,
        latestGwHitsCost: 0,
        weeksWithNegativePoints: 0,
        latestGwWentNegative: false,
        proposalsMade: 0,
        proposalsLanded: 0,
        secondingsMade: 0,
        gloatsAgainst: 0,
        gotAway: 0,
        gotCaught: 0,
        gloatPoints: 0,
        bank: 0,
        squadValue: 0,
      },
    ]),
  );

  for (const r of gwResults) {
    const a = byEntry.get(r.entry_id);
    if (!a) continue;
    a.loserP += r.loser_fine_p;
    a.belowAvgP += r.below_avg_fine_p;
    a.totalPoints += r.points;
    a.totalHitsCost += r.event_transfers_cost ?? 0;
    if (r.points < 0) a.weeksWithNegativePoints += 1;
    if (r.gw === latestGw) {
      a.latestGwPoints = r.points;
      a.latestGwHitsCost = r.event_transfers_cost ?? 0;
      a.latestGwWentNegative = r.points < 0;
      a.bank = r.bank ?? 0;
      a.squadValue = r.squad_value ?? 0;
    }
  }
  for (const f of fines) {
    const a = byEntry.get(f.target_entry);
    if (!a) continue;
    if (f.kind === "gloat") a.gloatsP += f.fine_p;
    else if (f.kind === "missed_report") a.missedP += f.fine_p;
    else if (f.kind === "emoji") a.emojiP += f.fine_p;
  }
  for (const a of byEntry.values()) {
    a.aiP = a.player.ai_caught_count * AI_FINE_P;
    a.gloatPoints += a.player.ai_caught_count * AI_GLOAT_PENALTY;
    a.totalP = a.loserP + a.belowAvgP + a.gloatsP + a.missedP + a.emojiP + a.aiP;
  }

  // Gloating league scoring.
  // Rules: +3 for proposing a gloat that's seconded within a week.
  //        +1 for seconding a proposal within a week.
  //        +1 for being targeted by a stale proposal (not seconded after 7 days).
  //        -3 for being targeted by a proposal that gets seconded within a week.
  // Pending proposals (<7 days, no seconder) and late-seconded ones are excluded.
  const now = Date.now();
  for (const g of (allGloats ?? []) as FineProposal[]) {
    const proposer = byEntry.get(g.proposed_by);
    const target = byEntry.get(g.target_entry);
    if (proposer) proposer.proposalsMade += 1;
    if (target) target.gloatsAgainst += 1;

    const proposedAt = new Date(g.proposed_at).getTime();
    if (g.seconded_at) {
      const secondedAt = new Date(g.seconded_at).getTime();
      if (secondedAt - proposedAt <= WEEK_MS) {
        // Landed in time
        if (proposer) {
          proposer.proposalsLanded += 1;
          proposer.gloatPoints += 3;
        }
        const seconder = g.seconded_by != null ? byEntry.get(g.seconded_by) : null;
        if (seconder) {
          seconder.secondingsMade += 1;
          seconder.gloatPoints += 1;
        }
        if (target) {
          target.gotCaught += 1;
          target.gloatPoints -= 3;
        }
      }
      // Late-seconded = no gloating-league points.
    } else if (now - proposedAt >= WEEK_MS) {
      // Stale: target got away with it.
      if (target) {
        target.gotAway += 1;
        target.gloatPoints += 1;
      }
    }
    // else: pending, < 7 days, not seconded — skip.
  }

  const all = [...byEntry.values()];
  const rankedByFines = [...all].sort((a, b) => b.totalP - a.totalP);
  const rankedByPoints = [...all].sort((a, b) => b.totalPoints - a.totalPoints);
  const rankedByGloating = [...all].sort((a, b) => b.gloatPoints - a.gloatPoints);

  // Momentum: intra-league position per GW for the last N GWs.
  const playedGws = Array.from(new Set(gwResults.map((r) => r.gw))).sort((a, b) => a - b);
  const recentGws = playedGws.slice(-MOMENTUM_WINDOW);
  const ranksByEntryByGw = new Map<number, Map<number, number>>();
  for (const gw of recentGws) {
    const sorted = gwResults.filter((r) => r.gw === gw).sort((a, b) => b.points - a.points);
    sorted.forEach((r, i) => {
      let m = ranksByEntryByGw.get(r.entry_id);
      if (!m) {
        m = new Map();
        ranksByEntryByGw.set(r.entry_id, m);
      }
      m.set(gw, i + 1);
    });
  }
  const momentum: MomentumRow[] = players.map((p) => {
    const ranks = recentGws.map((gw) => ranksByEntryByGw.get(p.entry_id)?.get(gw) ?? null);
    const valid = ranks.filter((r): r is number => r != null);
    const avgRank = valid.length ? valid.reduce((s, r) => s + r, 0) / valid.length : 0;
    let trend: "up" | "down" | "flat" = "flat";
    if (valid.length >= 4) {
      const half = Math.floor(valid.length / 2);
      const earlyAvg = valid.slice(0, half).reduce((s, r) => s + r, 0) / half;
      const lateAvg = valid.slice(half).reduce((s, r) => s + r, 0) / (valid.length - half);
      if (lateAvg < earlyAvg - 0.3) trend = "up";
      else if (lateAvg > earlyAvg + 0.3) trend = "down";
    }
    return { player: p, ranks, avgRank, trend };
  });
  const rankedByMomentum = momentum.slice().sort((a, b) => a.avgRank - b.avgRank);

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

  const negativeThisWeek = all.filter((a) => a.latestGwWentNegative);
  const hitsThisWeek = all.filter((a) => a.latestGwHitsCost > 0);

  return (
    <div className="space-y-8">
      {/* Emoji-trap reveal banner */}
      {caughtEmoji === "1" && (
        <section className="card p-4 bg-tabloid text-paper">
          <div className="kicker bg-paper text-ink">Gotcha</div>
          <h2 className="headline text-2xl mt-2">There&apos;s no need for the emoji!</h2>
          <p className="text-sm italic mt-1">
            You picked an emoji while reporting an emoji crime. That&apos;s also a 50p fine. We don&apos;t believe in emojis.
          </p>
        </section>
      )}

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
              <Link href={`/team/${latestWinner.entry_id}`} className="headline text-3xl underline decoration-tabloid decoration-2 underline-offset-2 block">
                {nameOf(latestWinner.entry_id)}
              </Link>
              <div className="text-sm">{latestWinner.points} pts</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-ink/60">Bottom of the bin</div>
              <Link href={`/team/${latestLoser.entry_id}`} className="headline text-3xl text-tabloid underline decoration-ink decoration-2 underline-offset-2 block">
                {nameOf(latestLoser.entry_id)}
              </Link>
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
          {(hitsThisWeek.length > 0 || negativeThisWeek.length > 0) && (
            <div className="mt-4 pt-3 border-t-2 border-dashed border-ink/30 text-sm space-y-1">
              {negativeThisWeek.map((a) => (
                <div key={`neg-${a.player.entry_id}`}>
                  <span className="shock">SHOCKER</span>{" "}
                  <Link href={`/team/${a.player.entry_id}`} className="font-bold underline decoration-tabloid">
                    {a.player.display_name}
                  </Link> went into the red — {a.latestGwPoints} pts.
                </div>
              ))}
              {hitsThisWeek.map((a) => (
                <div key={`hit-${a.player.entry_id}`} className="text-ink/70">
                  ⚠️ <Link href={`/team/${a.player.entry_id}`} className="font-bold underline">
                    {a.player.display_name}
                  </Link> took a {-a.latestGwHitsCost} hit ({a.latestGwPoints} pts net).
                </div>
              ))}
            </div>
          )}
        </section>
      )}


      {/* TABS */}
      <section>
        <div className="flex gap-2 mb-3 flex-wrap">
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
          <Link
            href="/?view=gloating"
            className={`px-4 py-2 border-3 border-ink uppercase font-bold text-sm tracking-widest ${
              view === "gloating" ? "bg-bargain text-ink" : "bg-paper text-ink hover:bg-bargain"
            }`}
          >
            Gloating league
          </Link>
          <Link
            href="/?view=momentum"
            className={`px-4 py-2 border-3 border-ink uppercase font-bold text-sm tracking-widest ${
              view === "momentum" ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-bargain"
            }`}
          >
            Momentum
          </Link>
          <Link
            href="/?view=bank"
            className={`px-4 py-2 border-3 border-ink uppercase font-bold text-sm tracking-widest ${
              view === "bank" ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-bargain"
            }`}
          >
            Bank
          </Link>
        </div>

        {view === "points" && (
          <>
            <h2 className="headline text-3xl mb-3">
              <span className="kicker">League</span> TABLE
            </h2>
            {(() => {
              const easyThird = rankedByPoints[2];
              if (!easyThird) return null;
              return (
                <div className="card p-4 mb-3 bg-bargain border-l-8 border-ink">
                  <div className="kicker">★ Easy Third ★</div>
                  <div className="headline text-2xl mt-2">
                    {easyThird.player.display_name}{" "}
                    <span className="text-tabloid">— picks the venue</span>
                  </div>
                  <div className="text-sm italic mt-1">
                    The lauded third-place spot. Currently held with {easyThird.totalPoints} pts.
                  </div>
                </div>
              );
            })()}
            {/* MOBILE: card stack */}
            <div className="md:hidden space-y-2">
              {rankedByPoints.map((a, i) => {
                const isEasyThird = a.player.entry_id === easyThirdEntry;
                return (
                  <div
                    key={a.player.entry_id}
                    className={`card p-3 ${isEasyThird ? "bg-bargain" : ""}`}
                  >
                    <div className="flex justify-between items-baseline gap-2">
                      <div>
                        <span className="font-display text-xl mr-2">{isEasyThird ? "🏆" : i + 1}</span>
                        <Link
                          href={`/team/${a.player.entry_id}`}
                          className="underline decoration-tabloid decoration-2 underline-offset-2 font-bold"
                        >
                          {a.player.display_name}
                        </Link>
                      </div>
                      <span className="font-display text-2xl tabular-nums">{a.totalPoints}</span>
                    </div>
                    {isEasyThird && (
                      <div className="mt-1"><span className="shock text-[11px]">★ EASY THIRD ★ Picks the venue</span></div>
                    )}
                    <div className="grid grid-cols-3 gap-2 text-xs mt-2 text-ink/70">
                      <div>GW {latestGw}: <strong>{a.latestGwPoints ?? "—"}</strong>{a.latestGwHitsCost > 0 && <span className="text-tabloid"> ({-a.latestGwHitsCost})</span>}</div>
                      <div>Hits: <strong className="text-tabloid">{a.totalHitsCost > 0 ? `-${a.totalHitsCost}` : "0"}</strong></div>
                      <div>Owed: <strong>{formatGbp(a.totalP)}</strong></div>
                    </div>
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
                    <th className="px-3 py-2 text-right" title="Net points this gameweek (already with hits deducted)">
                      GW {latestGw}
                    </th>
                    <th className="px-3 py-2 text-right">Total points</th>
                    <th className="px-3 py-2 text-right" title="Cumulative points lost to extra-transfer hits this season">
                      Hits
                    </th>
                    <th className="px-3 py-2 text-right text-ink/60">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedByPoints.map((a, i) => {
                    const isEasyThird = a.player.entry_id === easyThirdEntry;
                    return (
                    <tr
                      key={a.player.entry_id}
                      className={`border-t border-ink/20 ${
                        isEasyThird
                          ? "bg-bargain border-y-4 border-ink"
                          : "hover:bg-bargain/30"
                      }`}
                    >
                      <td className={`px-3 py-2 font-display text-lg ${isEasyThird ? "text-2xl" : ""}`}>
                        {isEasyThird ? "🏆" : i + 1}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/team/${a.player.entry_id}`}
                          className={`underline decoration-tabloid decoration-2 underline-offset-2 ${
                            isEasyThird ? "font-display text-xl uppercase" : ""
                          }`}
                        >
                          {a.player.display_name}
                        </Link>
                        {isEasyThird && (
                          <div className="mt-1">
                            <span className="shock text-[11px]">★ EASY THIRD ★ Picks the venue</span>
                          </div>
                        )}
                        {a.weeksWithNegativePoints > 0 && (
                          <span className="ml-2 text-[10px] uppercase tracking-widest text-tabloid">
                            {a.weeksWithNegativePoints}× red ink
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {a.latestGwPoints ?? "—"}
                        {a.latestGwHitsCost > 0 && (
                          <span className="text-tabloid text-xs ml-1">(-{a.latestGwHitsCost})</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{a.totalPoints}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-tabloid">
                        {a.totalHitsCost > 0 ? `-${a.totalHitsCost}` : "0"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink/60">{formatGbp(a.totalP)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {view === "fines" && (
          <>
            <h2 className="headline text-3xl mb-3">
              <span className="shock">SHAME</span> LEADERBOARD
            </h2>

            {/* MOBILE: card stack */}
            <div className="md:hidden space-y-2">
              {rankedByFines.map((a, i) => (
                <div key={a.player.entry_id} className="card p-3">
                  <div className="flex justify-between items-baseline gap-2">
                    <div>
                      <span className="font-display text-xl mr-2">{i + 1}</span>
                      <Link
                        href={`/team/${a.player.entry_id}`}
                        className="underline decoration-tabloid decoration-2 underline-offset-2 font-bold"
                      >
                        {a.player.display_name}
                      </Link>
                    </div>
                    <span className="font-display text-2xl tabular-nums text-tabloid">{formatGbp(a.totalP)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-2 text-ink/70">
                    <div>Loser: <strong>{formatGbp(a.loserP)}</strong></div>
                    <div>Below avg: <strong>{formatGbp(a.belowAvgP)}</strong></div>
                    <div>Gloats: <strong>{formatGbp(a.gloatsP)}</strong></div>
                    <div>Emojis: <strong>{formatGbp(a.emojiP)}</strong></div>
                    <div>Missed: <strong>{formatGbp(a.missedP)}</strong></div>
                    <div>AI: <strong>{formatGbp(a.aiP)}</strong></div>
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
                    <th className="px-3 py-2 text-right">Emojis</th>
                    <th className="px-3 py-2 text-right">Missed reports</th>
                    <th className="px-3 py-2 text-right">AI cheats</th>
                    <th className="px-3 py-2 text-right">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedByFines.map((a, i) => (
                    <tr key={a.player.entry_id} className="border-t border-ink/20 hover:bg-bargain/30">
                      <td className="px-3 py-2 font-display text-lg">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/team/${a.player.entry_id}`}
                          className="underline decoration-tabloid decoration-2 underline-offset-2"
                        >
                          {a.player.display_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatGbp(a.loserP)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatGbp(a.belowAvgP)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatGbp(a.gloatsP)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatGbp(a.emojiP)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatGbp(a.missedP)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatGbp(a.aiP)}</td>
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

        {view === "bank" && (() => {
          const fmtMillions = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;
          const rankedByAssets = [...all].sort(
            (a, b) => b.bank + b.squadValue - (a.bank + a.squadValue),
          );
          return (
            <>
              <h2 className="headline text-3xl mb-3">
                <span className="kicker">Buying</span> THE LEAGUE
              </h2>
              <p className="text-sm italic mb-3">
                Cash in the bank + current squad value at end of GW {latestGw}. Sorted by total assets.
              </p>

              {/* MOBILE: card stack */}
              <div className="md:hidden space-y-2">
                {rankedByAssets.map((a, i) => (
                  <div key={a.player.entry_id} className="card p-3">
                    <div className="flex justify-between items-baseline gap-2">
                      <div>
                        <span className="font-display text-xl mr-2">{i + 1}</span>
                        <Link
                          href={`/team/${a.player.entry_id}`}
                          className="underline decoration-tabloid decoration-2 underline-offset-2 font-bold"
                        >
                          {a.player.display_name}
                        </Link>
                      </div>
                      <span className="font-display text-2xl tabular-nums">{fmtMillions(a.bank + a.squadValue)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-2 text-ink/70">
                      <div>Bank: <strong>{fmtMillions(a.bank)}</strong></div>
                      <div>Squad: <strong>{fmtMillions(a.squadValue)}</strong></div>
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
                      <th className="px-3 py-2 text-right">Bank</th>
                      <th className="px-3 py-2 text-right">Squad value</th>
                      <th className="px-3 py-2 text-right">Total assets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedByAssets.map((a, i) => (
                      <tr key={a.player.entry_id} className="border-t border-ink/20 hover:bg-bargain/30">
                        <td className="px-3 py-2 font-display text-lg">{i + 1}</td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/team/${a.player.entry_id}`}
                            className="underline decoration-tabloid decoration-2 underline-offset-2"
                          >
                            {a.player.display_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMillions(a.bank)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMillions(a.squadValue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">
                          {fmtMillions(a.bank + a.squadValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}

        {view === "momentum" && (
          <>
            <h2 className="headline text-3xl mb-3">
              <span className="kicker">Momentum</span> LEADERBOARD
            </h2>
            <p className="text-sm italic mb-3">
              Form over the last {recentGws.length} GW{recentGws.length === 1 ? "" : "s"}.
              Each line shows weekly intra-league position (1 at top, {players.length} at bottom). Sorted by best average position.
              Trend = average of latest half vs first half.
            </p>

            {/* MOBILE: card stack */}
            <div className="md:hidden space-y-2">
              {rankedByMomentum.map((m, i) => (
                <div key={m.player.entry_id} className="card p-3">
                  <div className="flex justify-between items-center gap-2">
                    <div>
                      <span className="font-display text-xl mr-2">{i + 1}</span>
                      <Link
                        href={`/team/${m.player.entry_id}`}
                        className="underline decoration-tabloid decoration-2 underline-offset-2 font-bold"
                      >
                        {m.player.display_name}
                      </Link>
                    </div>
                    <span className="text-2xl">
                      {m.trend === "up" ? "↑" : m.trend === "down" ? <span className="text-tabloid">↓</span> : <span className="text-ink/40">—</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-2">
                    <Sparkline values={m.ranks} players={players.length} />
                    <div className="text-xs text-ink/70">
                      Avg pos: <strong className="font-display text-base">{m.avgRank > 0 ? m.avgRank.toFixed(1) : "—"}</strong>
                    </div>
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
                    <th className="px-3 py-2 text-left" title={`GW${recentGws[0]} → GW${recentGws[recentGws.length - 1]}`}>
                      Form (GW{recentGws[0] ?? "—"}–GW{recentGws[recentGws.length - 1] ?? "—"})
                    </th>
                    <th className="px-3 py-2 text-right">Avg pos</th>
                    <th className="px-3 py-2 text-center">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedByMomentum.map((m, i) => (
                    <tr key={m.player.entry_id} className="border-t border-ink/20 hover:bg-bargain/30">
                      <td className="px-3 py-2 font-display text-lg">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/team/${m.player.entry_id}`}
                          className="underline decoration-tabloid decoration-2 underline-offset-2"
                        >
                          {m.player.display_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Sparkline values={m.ranks} players={players.length} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {m.avgRank > 0 ? m.avgRank.toFixed(1) : "—"}
                      </td>
                      <td className="px-3 py-2 text-center font-bold">
                        {m.trend === "up" ? (
                          <span className="text-ink" title="Improving">↑</span>
                        ) : m.trend === "down" ? (
                          <span className="text-tabloid" title="Declining">↓</span>
                        ) : (
                          <span className="text-ink/40">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {view === "gloating" && (
          <>
            <h2 className="headline text-3xl mb-3">
              <span className="kicker">Gloating</span> LEAGUE
            </h2>
            <div className="card p-4 mb-3 bg-bargain text-sm">
              <strong className="uppercase tracking-widest text-xs">Scoring</strong>
              <ul className="mt-1 space-y-1 list-disc list-inside">
                <li><strong>+3</strong> for proposing a gloat that gets seconded within 7 days</li>
                <li><strong>+1</strong> for seconding someone else&apos;s proposal within 7 days</li>
                <li><strong>+1</strong> for being targeted by a proposal that goes stale (no seconder after 7 days) — &ldquo;got away with it&rdquo;</li>
                <li><strong>−3</strong> for being seconded — &ldquo;you got caught&rdquo;</li>
              </ul>
              <p className="text-xs italic mt-2 text-ink/70">
                Pending (under-7-day) proposals don&apos;t score yet. Voided proposals are excluded entirely.
              </p>
            </div>
            {/* MOBILE: card stack */}
            <div className="md:hidden space-y-2">
              {rankedByGloating.map((a, i) => (
                <div key={a.player.entry_id} className="card p-3">
                  <div className="flex justify-between items-baseline gap-2">
                    <div>
                      <span className="font-display text-xl mr-2">{i + 1}</span>
                      <Link
                        href={`/team/${a.player.entry_id}`}
                        className="underline decoration-tabloid decoration-2 underline-offset-2 font-bold"
                      >
                        {a.player.display_name}
                      </Link>
                    </div>
                    <span className="font-display text-2xl tabular-nums">{a.gloatPoints > 0 && "+"}{a.gloatPoints}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs mt-2 text-ink/70">
                    <div>Proposed: <strong>{a.proposalsMade}</strong></div>
                    <div>Landed: <strong>{a.proposalsLanded}</strong></div>
                    <div>Seconded: <strong>{a.secondingsMade}</strong></div>
                    <div>Against: <strong>{a.gloatsAgainst}</strong></div>
                    <div>Got away: <strong>{a.gotAway}</strong></div>
                    <div className="text-tabloid">Caught: <strong>{a.gotCaught}</strong></div>
                    <div className="col-span-3 text-tabloid">Fines: <strong>{formatGbp(a.gotCaught * GLOAT_FINE_P)}</strong></div>
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
                    <th className="px-3 py-2 text-right" title="Total proposals submitted by this player">Proposed</th>
                    <th className="px-3 py-2 text-right" title="Of those, how many got seconded in time">Landed</th>
                    <th className="px-3 py-2 text-right" title="Times this player rubber-stamped someone else's proposal">Seconded</th>
                    <th className="px-3 py-2 text-right" title="Total proposals targeting this player">Against</th>
                    <th className="px-3 py-2 text-right" title="Stale proposals against them — got away with the gloat">Got away</th>
                    <th className="px-3 py-2 text-right" title="Proposals against them that landed — paid the fine">Caught</th>
                    <th className="px-3 py-2 text-right" title="£1 per caught proposal">Fines</th>
                    <th className="px-3 py-2 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedByGloating.map((a, i) => (
                    <tr key={a.player.entry_id} className="border-t border-ink/20 hover:bg-bargain/30">
                      <td className="px-3 py-2 font-display text-lg">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/team/${a.player.entry_id}`}
                          className="underline decoration-tabloid decoration-2 underline-offset-2"
                        >
                          {a.player.display_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.proposalsMade}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.proposalsLanded}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.secondingsMade}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.gloatsAgainst}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.gotAway}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-tabloid">{a.gotCaught}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-tabloid">
                        {formatGbp(a.gotCaught * GLOAT_FINE_P)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">
                        {a.gloatPoints > 0 && "+"}{a.gloatPoints}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Bait button. Looks like a normal feature. Click silently records £5 fine + -10 gloating points. */}
      <section className="mt-2">
        <form action={triggerAiTrap}>
          <button
            type="submit"
            className="px-4 py-2 bg-paper border-3 border-ink uppercase font-bold text-xs tracking-widest hover:bg-bargain"
          >
            Generate report with AI
          </button>
        </form>
        <p className="mt-1 text-xs italic text-ink/50">
          Auto-drafts the loser&apos;s report using gameweek data.
        </p>
      </section>

      {(() => {
        // Admin-only — public visibility would reveal the trap and the bait stops working.
        if (!session?.is_admin) return null;
        const caught = all.filter((a) => a.player.ai_caught_count > 0).sort(
          (a, b) => b.player.ai_caught_count - a.player.ai_caught_count,
        );
        if (caught.length === 0) return null;
        return (
          <section className="card p-5 bg-tabloid text-paper">
            <div className="kicker bg-paper text-ink">Admin-only · Caught red-handed</div>
            <h2 className="headline text-3xl mt-2">HALL OF AI SHAME</h2>
            <p className="text-sm italic mt-1">
              These managers tried to outsource their loss report to a bot. £5 per click + -10 gloating points each. Public record.
            </p>
            <ul className="mt-3 space-y-1">
              {caught.map((a) => (
                <li key={a.player.entry_id} className="flex items-baseline gap-2">
                  <Link
                    href={`/team/${a.player.entry_id}`}
                    className="font-display text-xl underline decoration-paper decoration-2 underline-offset-2"
                  >
                    {a.player.display_name}
                  </Link>
                  <span className="text-sm">
                    × {a.player.ai_caught_count} {a.player.ai_caught_count === 1 ? "time" : "times"}
                    {" — "}
                    {formatGbp(a.player.ai_caught_count * AI_FINE_P)} owed,{" "}
                    {a.player.ai_caught_count * AI_GLOAT_PENALTY} gloat pts
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}

      <section className="card p-6 bg-bargain text-center">
        <div className="kicker">Witness a misdemeanour?</div>
        <h2 className="headline text-3xl md:text-5xl mt-3">REPORT A CRIME</h2>
        <p className="mt-2 text-sm italic">
          Gloat (£1, needs a second within 7 days) or emoji (50p, instant). Pick on the next page.
        </p>
        <Link
          href="/propose"
          className="inline-block mt-4 px-8 py-4 bg-tabloid text-paper border-3 border-ink font-display text-2xl uppercase tracking-widest shadow-[6px_6px_0_0_#0a0a0a] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_0_#0a0a0a]"
        >
          ▶ Report it
        </Link>
      </section>
      {/* ACTIVE PROPOSALS */}
      {(() => {
        const pendingProposals = (pending ?? []) as FineProposal[];
        return (
          <section>
            <div className="kicker">Awaiting verdict</div>
            <h2 className="headline text-3xl mt-2 mb-3">
              ACTIVE <span className="text-tabloid">GLOATS</span>
            </h2>
            {pendingProposals.length === 0 && (
              <div className="card p-5 text-center italic text-ink/60">
                No active gloats. The league is suspiciously well-behaved.{" "}
                <Link href="/propose" className="underline font-bold not-italic text-ink">
                  Spotted one?
                </Link>
              </div>
            )}
            <div className="grid gap-3">
              {pendingProposals.map((p) => {
                const target = byEntry.get(p.target_entry);
                const proposer = byEntry.get(p.proposed_by);
                const ageMs = Date.now() - new Date(p.proposed_at).getTime();
                const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
                const stale = ageMs >= WEEK_MS;
                const canVote =
                  session !== null &&
                  session.entry_id !== p.target_entry &&
                  session.entry_id !== p.proposed_by &&
                  !stale;
                let reason: string | null = null;
                if (!session) reason = "Login to second";
                else if (session.entry_id === p.target_entry) reason = "You're the target";
                else if (session.entry_id === p.proposed_by) reason = "You proposed it";
                else if (stale) reason = "Stale (>7 days) — got away with it";
                return (
                  <div key={p.id} className="card p-4 flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-xs uppercase tracking-widest text-ink/60">
                        {p.gloat_reason ? GLOAT_REASON_LABELS[p.gloat_reason] : "Gloat"}
                        {p.gloat_date && ` · ${p.gloat_date}`}
                        {" · proposed "}
                        {ageDays === 0 ? "today" : ageDays === 1 ? "yesterday" : `${ageDays} days ago`}
                        {" by "}
                        {proposer ? (
                          <Link href={`/team/${proposer.player.entry_id}`} className="underline">
                            {proposer.player.display_name}
                          </Link>
                        ) : (
                          `#${p.proposed_by}`
                        )}
                      </div>
                      <div className="headline text-2xl mt-1">
                        {target ? (
                          <Link href={`/team/${target.player.entry_id}`} className="underline decoration-tabloid decoration-2 underline-offset-2">
                            {target.player.display_name}
                          </Link>
                        ) : (
                          `#${p.target_entry}`
                        )}
                        <span className="text-tabloid"> — {formatGbp(p.fine_p)}</span>
                      </div>
                      {p.note && <div className="mt-1 text-sm italic">&ldquo;{p.note}&rdquo;</div>}
                      {stale && (
                        <div className="mt-1 text-xs uppercase tracking-widest text-ink/50">
                          ⚠ proposal expired without a seconder
                        </div>
                      )}
                    </div>
                    <div>
                      {canVote ? (
                        <form action={secondProposal}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="btn-primary">Second it</button>
                        </form>
                      ) : (
                        <span className="text-xs uppercase tracking-widest text-ink/50">{reason}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* EMOJI CRIMES LOG */}
      {(() => {
        const log = (emojiLog ?? []) as FineProposal[];
        if (log.length === 0) return null;
        return (
          <section>
            <div className="kicker">Police blotter</div>
            <h2 className="headline text-3xl mt-2 mb-3">EMOJI CRIMES LOG</h2>
            <div className="card overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead className="bg-ink text-paper uppercase text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Perpetrator</th>
                    <th className="px-3 py-2 text-left">Provoked by</th>
                    <th className="px-3 py-2 text-left">Emoji</th>
                    <th className="px-3 py-2 text-right">Fine</th>
                    <th className="px-3 py-2 text-left">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((p) => (
                    <tr key={p.id} className="border-t border-ink/20">
                      <td className="px-3 py-2 whitespace-nowrap">{p.gloat_date ?? new Date(p.proposed_at).toLocaleDateString("en-GB")}</td>
                      <td className="px-3 py-2">
                        <Link href={`/team/${p.target_entry}`} className="underline decoration-tabloid decoration-2">
                          {byEntry.get(p.target_entry)?.player.display_name ?? `#${p.target_entry}`}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {p.provoked_by ? (
                          <Link href={`/team/${p.provoked_by}`} className="underline">
                            {byEntry.get(p.provoked_by)?.player.display_name ?? `#${p.provoked_by}`}
                          </Link>
                        ) : (
                          <span className="text-ink/50 italic">unprompted</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-2xl">{p.emoji ?? <span className="text-ink/40 text-xs italic">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-tabloid">{formatGbp(p.fine_p)}</td>
                      <td className="px-3 py-2 text-xs italic text-ink/70">{p.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* MOBILE: card stack */}
            <div className="md:hidden space-y-2">
              {log.map((p) => (
                <div key={p.id} className="card p-3">
                  <div className="flex justify-between items-baseline gap-2">
                    <div>
                      <Link href={`/team/${p.target_entry}`} className="font-bold underline decoration-tabloid decoration-2">
                        {byEntry.get(p.target_entry)?.player.display_name ?? `#${p.target_entry}`}
                      </Link>
                      {p.emoji && <span className="ml-2 text-2xl">{p.emoji}</span>}
                    </div>
                    <span className="font-bold tabular-nums text-tabloid">{formatGbp(p.fine_p)}</span>
                  </div>
                  <div className="text-xs text-ink/70 mt-1 flex flex-wrap gap-x-3">
                    <span>{p.gloat_date ?? new Date(p.proposed_at).toLocaleDateString("en-GB")}</span>
                    <span>
                      Provoker:{" "}
                      {p.provoked_by ? (
                        <Link href={`/team/${p.provoked_by}`} className="underline">
                          {byEntry.get(p.provoked_by)?.player.display_name ?? `#${p.provoked_by}`}
                        </Link>
                      ) : (
                        <span className="italic">unprompted</span>
                      )}
                    </span>
                  </div>
                  {p.note && <div className="text-xs italic text-ink/70 mt-1">{p.note}</div>}
                </div>
              ))}
            </div>
          </section>
        );
      })()}
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
