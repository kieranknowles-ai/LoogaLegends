import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBootstrap, getEntryHistory } from "@/lib/fpl";
import { formatGbp, GLOAT_FINE_P } from "@/lib/scoring";
import { SeasonChart, type Series } from "./_components/SeasonChart";
import type { GameweekResult, FineProposal } from "@/lib/db-types";

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
  const [{ data: player }, { data: gws }, { data: applied }] = await Promise.all([
    supabase
      .from("players")
      .select("entry_id, display_name, first_name, is_admin")
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
  const finesByGw = new Map<number, { gloat: number; missed: number }>();
  for (const f of fines) {
    const gw = f.gw ?? 1;
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
              yLabel="Owed (pence)"
              yFormatter={(v) => formatGbp(v)}
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
