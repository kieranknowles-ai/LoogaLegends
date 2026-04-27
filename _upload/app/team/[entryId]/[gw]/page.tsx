import Link from "next/link";
import { getBootstrap, getEntryPicks } from "@/lib/fpl";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const POSITION = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" } as const;

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
  let errorMsg: string | null = null;
  try {
    picks = await getEntryPicks(entryId, gw);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Failed to fetch team.";
  }

  const bootstrap = await getBootstrap();
  const elementsById = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const teamsById = new Map(bootstrap.teams.map((t) => [t.id, t]));

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
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper uppercase text-xs">
              <tr>
                <th className="px-2 py-2 text-left">Slot</th>
                <th className="px-2 py-2 text-left">Player</th>
                <th className="px-2 py-2 text-left">Pos</th>
                <th className="px-2 py-2 text-left">Team</th>
                <th className="px-2 py-2 text-left">Captain</th>
              </tr>
            </thead>
            <tbody>
              {picks.picks.map((p) => {
                const el = elementsById.get(p.element);
                const team = el ? teamsById.get(el.team) : null;
                const onBench = p.position > 11;
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
