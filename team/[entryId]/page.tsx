import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBootstrap, getEntryHistory } from "@/lib/fpl";
import { formatGbp, GLOAT_FINE_P } from "@/lib/scoring";
import { SeasonChart, type Series } from "./_components/SeasonChart";
import { getSession } from "@/lib/auth";
import { updateBio } from "./actions";
import type { GameweekResult, FineProposal } from "@/lib/db-types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MOMENTUM_WINDOW = 10;

export const dynamic = "force-dynamic";

type View = "average" | "yoy" | "ffp";

export default async function TeamSeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { entryId: entryIdStr } = await params;
  const entryId = Number(entryIdStr);
  if (!Number.isFinite(entryId)) notFound();
  const { view: viewRaw } = await searchParams;
  const view: View = viewRaw === "yoy" ? "yoy" : viewRaw === "ffp" ? "ffp" : "average";

  const supabase = createAdminClient();
  const session = await getSession();
  const [
    { data: player },
    { data: gws },
    { data: applied },
    { data: allPlayers },
    { data: allGws },
    { data: allApplied },
    { data: allGloats },
  ] = await Promise.all([
    supabase
      .from("players")
      .select("entry_id, display_name, first_name, is_admin, bio")
      .eq("entry_id", entryId)
      .maybeSingle(),
    supabase
      .from("gameweek_results")
      .select("*")
      .eq("entry_id", entryId)
      .order("gw", { ascending: true }),
    supabase
      .from("applied_fines")
      .select("*")
      .eq("target_entry", entryId),
    supabase.from("players").select("entry_id, display_name"),
    supabase.from("gameweek_results").select("gw, entry_id, points, loser_fine_p, below_avg_fine_p"),
    supabase.from("applied_fines").select("kind, target_entry, fine_p"),
    supabase.from("fine_proposals").select("*").eq("kind", "gloat").eq("voided", false),
  ]);

  if (!player) notFound();

  const myGws = (gws ?? []) as GameweekResult[];
  const fines = (applied ?? []) as FineProposal[];
  const latestGw = myGws.length ? Math.max(...myGws.map((r) => r.gw)) : 1;

  // Load FPL bootstrap + this entry's history (for past seasons + national avg by GW).
  const [bootstrap, history] = await Promise.all([getBootstrap(), getEntryHistory(entryId)]);
  const finishedEvents = bootstrap.events.filter((e) => e.finished || e.is_current);
  const xLabels = finishedEvents.map((e) => `GW${e.id}`);

  // Build per-GW lookup for this player's points.
  const myByGw = new Map(myGws.map((r) => [r.gw, r] as const));

  // -------- AVERAGE VIEW --------
  const myPointsSeries = finishedEvents.map((e) => myByGw.get(e.id)?.points ?? null);
  const avgPointsSeries = finishedEvents.map((e) => e.average_entry_score);
  const averageSeries: Series[] = [
    { label: player.display_name, color: "#c8102e", data: myPointsSeries },
    { label: "National avg", color: "#0a0a0a", data: avgPointsSeries, dashed: true },
  ];

  // -------- YEAR-ON-YEAR VIEW --------
  let cumulative = 0;
  const cumThisSeason: number[] = finishedEvents.map((e) => {
    const r = myByGw.get(e.id);
    if (r != null) cumulative += r.points;
    return cumulative;
  });
  const lastSeason = history.past?.[history.past.length - 1] ?? null;
  const lastSeasonTotal = lastSeason?.total_points ?? null;
  const lastSeasonPace =
    lastSeasonTotal != null
      ? finishedEvents.map((_, i) => Math.round(((i + 1) / 38) * lastSeasonTotal))
      : finishedEvents.map(() => null as number | null);
  const yoySeries: Series[] = [
    { label: `This season (cumulative)`, color: "#c8102e", data: cumThisSeason },
    {
      label: lastSeason ? `${lastSeason.season_name} pace` : "No prior season",
      color: "#0a0a0a",
      data: lastSeasonPace,
      dashed: true,
    },
  ];

  // -------- FINANCIAL FAIR PLAY VIEW --------
  // Cumulative pence-owed by source, by GW.
  // Gloats: bucket by gloat_date → fall back to proposed_at → look up the GW whose
  // deadline_time was the most recent on or before that date.
  const gwForDate = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const target = new Date(iso).getTime();
    if (Number.isNaN(target)) return null;
    let best: number | null = null;
    for (const e of bootstrap.events) {
      if (new Date(e.deadline_time).getTime() <= target) best = e.id;
    }
    return best;
  };

  const finesByGw = new Map<number, { gloat: number; missed: number }>();
  for (const f of fines) {
    let gw: number | null;
    if (f.kind === "gloat") {
      gw = gwForDate(f.gloat_date) ?? gwForDate(f.proposed_at) ?? 1;
    } else {
      gw = f.gw;
    }
    if (gw == null) continue;
    const cur = finesByGw.get(gw) ?? { gloat: 0, missed: 0 };
    if (f.kind === "gloat") cur.gloat += f.fine_p;
    else cur.missed += f.fine_p;
    finesByGw.set(gw, cur);
  }
  let cumLoser = 0,
    cumBelowAvg = 0,
    cumGloat = 0,
    cumMissed = 0;
  const ffpData = finishedEvents.map((e) => {
    const r = myByGw.get(e.id);
    if (r) {
      cumLoser += r.loser_fine_p;
      cumBelowAvg += r.below_avg_fine_p;
    }
    const f = finesByGw.get(e.id);
    if (f) {
      cumGloat += f.gloat;
      cumMissed += f.missed;
    }
    return { cumLoser, cumBelowAvg, cumGloat, cumMissed };
  });
  const ffpSeries: Series[] = [
    { label: "Loser fines", color: "#c8102e", data: ffpData.map((d) => d.cumLoser) },
    { label: "Below avg", color: "#0a0a0a", data: ffpData.map((d) => d.cumBelowAvg) },
    { label: "Gloats", color: "#fbbf24", data: ffpData.map((d) => d.cumGloat) },
    { label: "Missed reports", color: "#7c3aed", data: ffpData.map((d) => d.cumMissed) },
  ];

  const totalPotP = ffpData.length
    ? ffpData[ffpData.length - 1].cumLoser +
      ffpData[ffpData.length - 1].cumBelowAvg +
      ffpData[ffpData.length - 1].cumGloat +
      ffpData[ffpData.length - 1].cumMissed
    : 0;

  // ---------- HEADLINES ----------
  type Row = { entry_id: number };
  const players = (allPlayers ?? []) as (Row & { display_name: string })[];
  const allGwRows = (allGws ?? []) as Pick<GameweekResult, "gw" | "entry_id" | "points" | "loser_fine_p" | "below_avg_fine_p">[];
  const allFineRows = (allApplied ?? []) as Pick<FineProposal, "kind" | "target_entry" | "fine_p">[];
  const allGloatRows = (allGloats ?? []) as FineProposal[];

  // League position by season points
  const totalPointsByEntry = new Map<number, number>();
  for (const r of allGwRows) {
    totalPointsByEntry.set(r.entry_id, (totalPointsByEntry.get(r.entry_id) ?? 0) + r.points);
  }
  const pointsRanked = [...totalPointsByEntry.entries()].sort((a, b) => b[1] - a[1]);
  const leaguePos = pointsRanked.findIndex(([id]) => id === entryId);
  const myTotalPoints = totalPointsByEntry.get(entryId) ?? 0;

  // Shame position by total owed
  const owedByEntry = new Map<number, number>();
  for (const r of allGwRows) {
    owedByEntry.set(r.entry_id, (owedByEntry.get(r.entry_id) ?? 0) + r.loser_fine_p + r.below_avg_fine_p);
  }
  for (const f of allFineRows) {
    owedByEntry.set(f.target_entry, (owedByEntry.get(f.target_entry) ?? 0) + f.fine_p);
  }
  const owedRanked = [...owedByEntry.entries()].sort((a, b) => b[1] - a[1]);
  const shamePos = owedRanked.findIndex(([id]) => id === entryId);
  const myTotalOwed = owedByEntry.get(entryId) ?? 0;

  // Gloating points
  const gloatPointsByEntry = new Map<number, number>();
  const now = Date.now();
  for (const g of allGloatRows) {
    const proposedAt = new Date(g.proposed_at).getTime();
    if (g.seconded_at) {
      if (new Date(g.seconded_at).getTime() - proposedAt <= WEEK_MS) {
        gloatPointsByEntry.set(g.proposed_by, (gloatPointsByEntry.get(g.proposed_by) ?? 0) + 3);
        if (g.seconded_by != null) {
          gloatPointsByEntry.set(g.seconded_by, (gloatPointsByEntry.get(g.seconded_by) ?? 0) + 1);
        }
        gloatPointsByEntry.set(g.target_entry, (gloatPointsByEntry.get(g.target_entry) ?? 0) - 3);
      }
    } else if (now - proposedAt >= WEEK_MS) {
      gloatPointsByEntry.set(g.target_entry, (gloatPointsByEntry.get(g.target_entry) ?? 0) + 1);
    }
  }
  const gloatRanked = players
    .map((p) => ({ entry_id: p.entry_id, pts: gloatPointsByEntry.get(p.entry_id) ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  const gloatPos = gloatRanked.findIndex((g) => g.entry_id === entryId);
  const myGloatPts = gloatPointsByEntry.get(entryId) ?? 0;

  // Momentum — average intra-league position over last MOMENTUM_WINDOW played GWs
  const playedGws = Array.from(new Set(allGwRows.map((r) => r.gw))).sort((a, b) => a - b);
  const recentGws = playedGws.slice(-MOMENTUM_WINDOW);
  const myRanks: number[] = [];
  for (const gw of recentGws) {
    const sorted = allGwRows.filter((r) => r.gw === gw).sort((a, b) => b.points - a.points);
    const pos = sorted.findIndex((r) => r.entry_id === entryId);
    if (pos >= 0) myRanks.push(pos + 1);
  }
  const myAvgPos = myRanks.length ? myRanks.reduce((s, r) => s + r, 0) / myRanks.length : 0;
  let trend: "up" | "down" | "flat" = "flat";
  if (myRanks.length >= 4) {
    const half = Math.floor(myRanks.length / 2);
    const earlyAvg = myRanks.slice(0, half).reduce((s, r) => s + r, 0) / half;
    const lateAvg = myRanks.slice(half).reduce((s, r) => s + r, 0) / (myRanks.length - half);
    if (lateAvg < earlyAvg - 0.3) trend = "up";
    else if (lateAvg > earlyAvg + 0.3) trend = "down";
  }
  const ord = (n: number) => {
    if (n < 0) return "—";
    const v = n + 1;
    const s = ["th", "st", "nd", "rd"];
    const m = v % 100;
    return v + (s[(m - 20) % 10] || s[m] || s[0]);
  };

  const canEditBio = session !== null && (session.entry_id === entryId || session.is_admin);

  return (
    <div className="space-y-6">
      <div>
        <div className="kicker">Manager dossier</div>
        <h1 className="headline text-5xl mt-3">{player.display_name}</h1>
        <p className="mt-1 text-sm italic">
          Total owed: <strong className="text-tabloid">{formatGbp(totalPotP)}</strong> ·
          Gloat tariff: <strong>{formatGbp(GLOAT_FINE_P)}</strong> ·{" "}
          <Link href={`/team/${entryId}/${latestGw}`} className="underline decoration-tabloid decoration-2">
            View squad (GW {latestGw})
          </Link>
        </p>
      </div>

      {/* RECENT HEADLINES */}
      <section>
        <div className="kicker mb-2">Recent headlines</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <HeadlineCard
            label="League position"
            value={leaguePos >= 0 ? ord(leaguePos) : "—"}
            sub={`${myTotalPoints} pts`}
          />
          <HeadlineCard
            label="Shame position"
            value={shamePos >= 0 ? ord(shamePos) : "—"}
            sub={formatGbp(myTotalOwed)}
            tabloid
          />
          <HeadlineCard
            label="Gloating"
            value={gloatPos >= 0 ? ord(gloatPos) : "—"}
            sub={`${myGloatPts >= 0 ? "+" : ""}${myGloatPts} pts`}
          />
          <HeadlineCard
            label="Momentum"
            value={myAvgPos > 0 ? `Avg ${myAvgPos.toFixed(1)}` : "—"}
            sub={trend === "up" ? "↑ trending up" : trend === "down" ? "↓ trending down" : "— flat"}
          />
        </div>
      </section>

      {/* BIO */}
      <section className="card p-5">
        <div className="kicker">Bio</div>
        <h2 className="headline text-2xl mt-2 mb-2">About the manager</h2>
        {canEditBio ? (
          <form action={updateBio} className="space-y-2">
            <input type="hidden" name="entry_id" value={entryId} />
            <textarea
              name="bio"
              defaultValue={player.bio ?? ""}
              maxLength={600}
              rows={3}
              placeholder="Write your bio. Catchphrases, claims to fame, formation philosophy. Max 600 chars."
              className="w-full border-3 border-ink p-2 bg-paper text-sm"
            />
            <button type="submit" className="btn-primary text-xs">Save bio</button>
          </form>
        ) : player.bio ? (
          <p className="italic whitespace-pre-wrap">{player.bio}</p>
        ) : (
          <p className="italic text-ink/50">No bio yet. Manager hasn&apos;t written one.</p>
        )}
      </section>

      <nav className="flex flex-wrap gap-2">
        <ChartTab href={`/team/${entryId}?view=average`} active={view === "average"} label="Average" />
        <ChartTab href={`/team/${entryId}?view=yoy`} active={view === "yoy"} label="Year-on-year" />
        <ChartTab href={`/team/${entryId}?view=ffp`} active={view === "ffp"} label="Financial fair play" />
      </nav>

      <section className="card p-4">
        {view === "average" && (
          <>
            <div className="kicker">Points vs national average</div>
            <h2 className="headline text-2xl mt-2">Per-GW score</h2>
            <p className="text-sm italic text-ink/70 mb-2">
              Net points after transfer hits. Anything below the dashed line is a below-average fine.
            </p>
            <SeasonChart series={averageSeries} xLabels={xLabels} yLabel="Points" />
          </>
        )}

        {view === "yoy" && (
          <>
            <div className="kicker">Year-on-year pace</div>
            <h2 className="headline text-2xl mt-2">Cumulative points</h2>
            <p className="text-sm italic text-ink/70 mb-2">
              {lastSeason
                ? `Last season finished on ${lastSeason.total_points} pts. Dashed line = that total spread evenly across 38 GWs.`
                : "No prior season data available for this manager."}
            </p>
            <SeasonChart series={yoySeries} xLabels={xLabels} yLabel="Cumulative points" />
          </>
        )}

        {view === "ffp" && (
          <>
            <div className="kicker">Financial fair play</div>
            <h2 className="headline text-2xl mt-2">Cumulative debt by source</h2>
            <p className="text-sm italic text-ink/70 mb-2">
              Where the money&apos;s gone. All cumulative across the season, in pence.
            </p>
            <SeasonChart
              series={ffpSeries}
              xLabels={xLabels}
              yFormatter={(v) => formatGbp(v)}
              yStep={500}
            />
          </>
        )}
      </section>
    </div>
  );
}

function ChartTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 border-3 border-ink uppercase font-bold text-sm tracking-widest ${
        active ? "bg-tabloid text-paper" : "bg-paper text-ink hover:bg-bargain"
      }`}
    >
      {label}
    </Link>
  );
}

function HeadlineCard({
  label,
  value,
  sub,
  tabloid,
}: {
  label: string;
  value: string;
  sub: string;
  tabloid?: boolean;
}) {
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-widest font-bold text-ink/60">{label}</div>
      <div className={`headline text-3xl mt-1 ${tabloid ? "text-tabloid" : ""}`}>{value}</div>
      <div className="text-xs mt-1 text-ink/70">{sub}</div>
    </div>
  );
}
