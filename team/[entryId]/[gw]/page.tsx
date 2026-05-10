import Link from "next/link";
import { getBootstrap, getEntryPicks, getEventLive } from "@/lib/fpl";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const POSITION = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" } as const;

// 20-colour palette so every PL club gets a distinct slice.
const PIE_PALETTE = [
  "#c8102e", "#0a0a0a", "#fbbf24", "#7c3aed", "#0891b2",
  "#16a34a", "#dc2626", "#2563eb", "#ea580c", "#65a30d",
  "#be123c", "#0e7490", "#a16207", "#9333ea", "#15803d",
  "#1d4ed8", "#b91c1c", "#854d0e", "#0369a1", "#581c87",
];

function ClubPie({ slices }: { slices: { label: string; count: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (total === 0) return null;
  const cx = 100, cy = 100, r = 90;
  let startAngle = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const angle = (s.count / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    const labelAngle = startAngle + angle / 2;
    const labelX = cx + r * 0.65 * Math.cos(labelAngle);
    const labelY = cy + r * 0.65 * Math.sin(labelAngle);
    const result = { ...s, path, labelX, labelY };
    startAngle = endAngle;
    return result;
  });
  return (
    <div className="flex items-start gap-4 flex-wrap">
      <svg viewBox="0 0 200 200" className="w-48 h-48 shrink-0">
        {arcs.map((a) => (
          <g key={a.label}>
            <path d={a.path} fill={a.color} stroke="#0a0a0a" strokeWidth="1.5" />
            {a.count >= 2 && (
              <text
                x={a.labelX}
                y={a.labelY + 4}
                fontSize="13"
                fontWeight="800"
                textAnchor="middle"
                fill="#fff"
                stroke="#000"
                strokeWidth="0.6"
                paintOrder="stroke"
              >
                {a.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <ul className="text-sm space-y-1">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 border border-ink" style={{ background: s.color }} />
            <strong className="font-bold">{s.label}</strong>
            <span className="text-ink/60">× {s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ entryId: string; gw: string }>;
}) {
  const { entryId: entryIdStr, gw: gwStr } = await params;
  const entryId = Number(entryIdStr);
  const gw = Number(gwStr);

  const supabase = createAdminClient();
  const { data: player } = await supabase
    .from("players")
    .select("entry_id, display_name")
    .eq("entry_id", entryId)
    .maybeSingle();

  let picks: Awaited<ReturnType<typeof getEntryPicks>> | null = null;
  let live: Awaited<ReturnType<typeof getEventLive>> | null = null;
  let errorMsg: string | null = null;
  try {
    [picks, live] = await Promise.all([getEntryPicks(entryId, gw), getEventLive(gw)]);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Failed to fetch team.";
  }

  const bootstrap = await getBootstrap();
  const elementsById = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const teamsById = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const livePointsById = new Map(
    (live?.elements ?? []).map((e) => [e.id, e.stats.total_points] as const),
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="kicker">Squad reveal</div>
        <h1 className="headline text-4xl mt-3">
          {player?.display_name ?? `Manager #${entryId}`} <span className="text-tabloid">— GW {gw}</span>
        </h1>
        {picks && (
          <p className="text-sm italic mt-1">
            {picks.entry_history.points} pts · chip: {picks.active_chip ?? "none"} · hits: {picks.entry_history.event_transfers_cost}
          </p>
        )}
      </div>

      {errorMsg && (
        <div className="card p-4 bg-tabloid text-paper text-sm">
          Couldn&apos;t fetch picks: {errorMsg}
        </div>
      )}

      {picks && (
        <>
          {/* MOBILE: card stack */}
          <div className="md:hidden space-y-2">
            {picks.picks.map((p) => {
              const el = elementsById.get(p.element);
              const team = el ? teamsById.get(el.team) : null;
              const onBench = p.position > 11;
              const rawPts = livePointsById.get(p.element);
              const counted = rawPts != null ? rawPts * p.multiplier : null;
              return (
                <div key={p.element} className={`card p-3 ${onBench ? "opacity-60" : ""}`}>
                  <div className="flex justify-between items-baseline gap-2">
                    <div>
                      <span className="font-display text-base mr-2">
                        {p.position}{onBench && " (B)"}
                      </span>
                      <span className="font-bold">
                        {el ? `${el.first_name} ${el.second_name}` : `#${p.element}`}
                      </span>
                      {p.is_captain && <span className="ml-2 text-tabloid font-bold">★ C</span>}
                      {p.is_vice_captain && <span className="ml-2 text-ink/60">VC</span>}
                    </div>
                    <span className="font-display text-2xl tabular-nums">
                      {counted == null ? "—" : onBench ? "0" : counted}
                    </span>
                  </div>
                  <div className="text-xs text-ink/70 mt-1 flex flex-wrap gap-x-3">
                    <span>{el ? POSITION[el.element_type as 1|2|3|4] : "—"}</span>
                    <span>{team?.short_name ?? "—"}</span>
                    <span>Pts: <strong>{rawPts ?? "—"}</strong></span>
                    {p.multiplier > 1 && <span>×{p.multiplier}</span>}
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
                <th className="px-2 py-2 text-left">Slot</th>
                <th className="px-2 py-2 text-left">Player</th>
                <th className="px-2 py-2 text-left">Pos</th>
                <th className="px-2 py-2 text-left">Team</th>
                <th className="px-2 py-2 text-left">Captain</th>
                <th className="px-2 py-2 text-right">Pts</th>
                <th className="px-2 py-2 text-right">Counted</th>
              </tr>
            </thead>
            <tbody>
              {picks.picks.map((p) => {
                const el = elementsById.get(p.element);
                const team = el ? teamsById.get(el.team) : null;
                const onBench = p.position > 11;
                const rawPts = livePointsById.get(p.element);
                const counted = rawPts != null ? rawPts * p.multiplier : null;
                return (
                  <tr key={p.element} className={`border-t border-ink/20 ${onBench ? "opacity-60" : ""}`}>
                    <td className="px-2 py-2 tabular-nums">{p.position}{onBench && " (bench)"}</td>
                    <td className="px-2 py-2 font-bold">
                      {el ? `${el.first_name} ${el.second_name}` : `#${p.element}`}
                    </td>
                    <td className="px-2 py-2">{el ? POSITION[el.element_type as 1|2|3|4] : "—"}</td>
                    <td className="px-2 py-2">{team?.short_name ?? "—"}</td>
                    <td className="px-2 py-2">
                      {p.is_captain ? "★ C" : p.is_vice_captain ? "VC" : ""}
                      {p.multiplier > 1 && p.multiplier !== 2 && ` (${p.multiplier}x)`}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {rawPts ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold">
                      {counted == null ? "—" : onBench ? "0" : counted}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {picks && (() => {
        const counts = new Map<number, number>();
        for (const p of picks.picks) {
          const el = elementsById.get(p.element);
          if (!el) continue;
          counts.set(el.team, (counts.get(el.team) ?? 0) + 1);
        }
        const slices = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([teamId, count], i) => ({
            label: teamsById.get(teamId)?.short_name ?? `T${teamId}`,
            count,
            color: PIE_PALETTE[i % PIE_PALETTE.length],
          }));
        return (
          <section className="card p-5">
            <div className="kicker">Club bias</div>
            <h2 className="headline text-2xl mt-2">Squad by club</h2>
            <div className="mt-3">
              <ClubPie slices={slices} />
            </div>
          </section>
        );
      })()}

      <div className="flex gap-2">
        {gw > 1 && (
          <Link href={`/team/${entryId}/${gw - 1}`} className="btn-primary">← GW {gw - 1}</Link>
        )}
        {gw < 38 && (
          <Link href={`/team/${entryId}/${gw + 1}`} className="btn-primary">GW {gw + 1} →</Link>
        )}
      </div>
    </div>
  );
}
