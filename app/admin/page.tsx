import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatGbp } from "@/lib/scoring";
import {
  addMissedReport,
  clearPassword,
  setDisplayName,
  setFirstName,
  toggleMissedReport,
  unvoidProposal,
  voidProposal,
} from "./actions";
import type { FineProposal, Player, GameweekResult } from "@/lib/db-types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");

  if (!session.is_admin) {
    return (
      <div className="card p-6">
        <div className="kicker">Backstage</div>
        <h1 className="headline text-4xl mt-3 text-tabloid">Admins only.</h1>
        <p className="mt-2 italic text-sm">
          Logged in as {session.display_name}. Ask Kieran to flip <code>is_admin = true</code> on your row in Supabase.
        </p>
      </div>
    );
  }

  const admin = createAdminClient();
  const [{ data: proposals }, { data: players }, { data: gwsResults }] = await Promise.all([
    admin.from("fine_proposals").select("*").order("proposed_at", { ascending: false }),
    admin.from("players").select("*").order("display_name"),
    admin.from("gameweek_results").select("gw").order("gw", { ascending: true }),
  ]);

  const allPlayers = (players ?? []) as Player[];
  const allProposals = (proposals ?? []) as FineProposal[];
  const nameOf = (id: number) => allPlayers.find((p) => p.entry_id === id)?.display_name ?? `#${id}`;
  const others = allPlayers.filter((p) => p.entry_id !== session.entry_id);
  const gws = Array.from({ length: 38 }, (_, i) => i + 1);

  // GWs we've actually synced (i.e. finished or in-progress) — only these can have missed reports.
  const playedGws = Array.from(new Set(((gwsResults ?? []) as Pick<GameweekResult, "gw">[]).map((r) => r.gw))).sort(
    (a, b) => a - b,
  );

  // Lookup: missed_report state per (entry_id, gw). "applied" | "voided" | undefined (none).
  const reportState = new Map<string, "applied" | "voided">();
  for (const p of allProposals) {
    if (p.kind !== "missed_report" || p.gw == null) continue;
    const key = `${p.target_entry}:${p.gw}`;
    // Latest wins (proposals are sorted desc by proposed_at).
    if (!reportState.has(key)) {
      reportState.set(key, p.voided ? "voided" : "applied");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="kicker">Editor&apos;s desk · {session.display_name}</div>
        <h1 className="headline text-4xl mt-3">ADMIN</h1>
      </div>

      {/* Missed report grid — Mark toggles cells. Green ✓ = submitted, red ✗ = missed. */}
      <section>
        <div className="kicker">Reports register</div>
        <h2 className="headline text-2xl mt-2">Missed reports — yes/no by gameweek</h2>
        <p className="text-sm mt-1 italic">
          Click a cell to flip it. Default is &ldquo;submitted&rdquo; (green ✓). Mark as missed (red ✗) and the fine auto-applies —
          £10 first miss, then ×1.5 each subsequent (£15, £22.50, £33.75…) per player.
        </p>
        {playedGws.length === 0 ? (
          <div className="card p-4 mt-3 italic text-ink/60">No completed gameweeks yet.</div>
        ) : (
          <div className="card overflow-x-auto mt-3">
            <table className="text-xs">
              <thead className="bg-ink text-paper uppercase">
                <tr>
                  <th className="px-2 py-2 text-left sticky left-0 bg-ink z-10">Manager</th>
                  {playedGws.map((g) => (
                    <th key={g} className="px-1 py-2 text-center min-w-[40px]">{g}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPlayers.map((p) => (
                  <tr key={p.entry_id} className="border-t border-ink/20">
                    <td className="px-2 py-1 sticky left-0 bg-paper font-bold whitespace-nowrap">
                      {p.display_name}
                    </td>
                    {playedGws.map((g) => {
                      const key = `${p.entry_id}:${g}`;
                      const state = reportState.get(key);
                      const missed = state === "applied";
                      return (
                        <td key={g} className="px-1 py-1 text-center">
                          <form action={toggleMissedReport} className="inline">
                            <input type="hidden" name="target_entry" value={p.entry_id} />
                            <input type="hidden" name="gw" value={g} />
                            <button
                              type="submit"
                              title={missed ? "Click to mark as submitted" : "Click to mark as missed"}
                              className={`w-7 h-7 border-2 border-ink font-bold ${
                                missed ? "bg-tabloid text-paper" : "bg-bargain/50 text-ink/40 hover:bg-bargain"
                              }`}
                            >
                              {missed ? "✗" : "✓"}
                            </button>
                          </form>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Backup form-based missed-report entry (with optional note). */}
      <section className="card p-5 bg-bargain">
        <div className="kicker">Missed report (with note)</div>
        <h2 className="headline text-2xl mt-2">Add with a note</h2>
        <p className="text-sm mt-1 italic">
          Use this when you want to attach a note (e.g. &ldquo;reported late, partial credit&rdquo;).
          Fine auto-escalates per prior offence. No seconding.
        </p>
        <form action={addMissedReport} className="mt-3 grid sm:grid-cols-3 gap-2">
          <select name="target_entry" required className="border-3 border-ink p-2 bg-paper text-sm">
            <option value="">Target...</option>
            {others.map((p) => <option key={p.entry_id} value={p.entry_id}>{p.display_name}</option>)}
          </select>
          <select name="gw" required className="border-3 border-ink p-2 bg-paper text-sm">
            <option value="">Gameweek...</option>
            {gws.map((g) => <option key={g} value={g}>GW {g}</option>)}
          </select>
          <button type="submit" className="btn-primary text-sm">Apply fine</button>
          <textarea name="note" rows={2} placeholder="Note (optional)" className="border-3 border-ink p-2 bg-paper text-sm sm:col-span-3" />
        </form>
      </section>

      <section>
        <h2 className="headline text-2xl mb-3">All proposals</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper uppercase text-xs">
              <tr>
                <th className="px-2 py-2 text-left">When</th>
                <th className="px-2 py-2 text-left">Kind</th>
                <th className="px-2 py-2 text-left">Target</th>
                <th className="px-2 py-2 text-right">£</th>
                <th className="px-2 py-2 text-left">Proposed by</th>
                <th className="px-2 py-2 text-left">Seconded by</th>
                <th className="px-2 py-2 text-left">State</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {allProposals.map((p) => (
                <tr key={p.id} className={`border-t border-ink/20 ${p.voided ? "opacity-50" : ""}`}>
                  <td className="px-2 py-2 whitespace-nowrap">{new Date(p.proposed_at).toLocaleDateString()}</td>
                  <td className="px-2 py-2">{p.kind}{p.gw ? ` GW${p.gw}` : ""}</td>
                  <td className="px-2 py-2">{nameOf(p.target_entry)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatGbp(p.fine_p)}</td>
                  <td className="px-2 py-2">{nameOf(p.proposed_by)}</td>
                  <td className="px-2 py-2">{p.seconded_by ? nameOf(p.seconded_by) : "—"}</td>
                  <td className="px-2 py-2">
                    {p.voided ? "voided" : p.seconded_at ? "applied" : "pending"}
                  </td>
                  <td className="px-2 py-2">
                    {!p.voided ? (
                      <form action={voidProposal} className="flex gap-1">
                        <input type="hidden" name="id" value={p.id} />
                        <input name="reason" placeholder="reason" className="border-2 border-ink p-1 text-xs w-24" />
                        <button className="btn-primary text-xs">Void</button>
                      </form>
                    ) : (
                      <form action={unvoidProposal}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn-primary text-xs">Restore</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {allProposals.length === 0 && (
                <tr><td colSpan={8} className="px-2 py-6 text-center italic text-ink/60">No proposals yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="headline text-2xl mb-3">Players</h2>
        <p className="text-xs text-ink/60 mb-2 italic">
          Set <code>first_name</code> to whatever each player will type at login (lowercase). Click &quot;Reset password&quot; to wipe a hash so they re-set on next login.
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper uppercase text-xs">
              <tr>
                <th className="px-2 py-2 text-left">Entry</th>
                <th className="px-2 py-2 text-left">Display name</th>
                <th className="px-2 py-2 text-left">First name (login)</th>
                <th className="px-2 py-2 text-left">Admin?</th>
                <th className="px-2 py-2 text-left">Password set?</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {allPlayers.map((p) => (
                <tr key={p.entry_id} className="border-t border-ink/20">
                  <td className="px-2 py-2 tabular-nums">{p.entry_id}</td>
                  <td className="px-2 py-2">
                    <form action={setDisplayName} className="flex gap-1">
                      <input type="hidden" name="entry_id" value={p.entry_id} />
                      <input name="display_name" defaultValue={p.display_name} className="border-2 border-ink p-1" />
                      <button className="btn-primary text-xs">Save</button>
                    </form>
                  </td>
                  <td className="px-2 py-2">
                    <form action={setFirstName} className="flex gap-1">
                      <input type="hidden" name="entry_id" value={p.entry_id} />
                      <input name="first_name" defaultValue={p.first_name ?? ""} placeholder="lowercase" className="border-2 border-ink p-1" />
                      <button className="btn-primary text-xs">Save</button>
                    </form>
                  </td>
                  <td className="px-2 py-2">{p.is_admin ? "★" : ""}</td>
                  <td className="px-2 py-2">{p.password_hash ? "✓" : "—"}</td>
                  <td className="px-2 py-2">
                    {p.password_hash && (
                      <form action={clearPassword}>
                        <input type="hidden" name="entry_id" value={p.entry_id} />
                        <button className="btn-primary text-xs">Reset password</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
