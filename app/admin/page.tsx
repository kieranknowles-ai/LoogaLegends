import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatGbp } from "@/lib/scoring";
import { setDisplayName, unvoidProposal, voidProposal } from "./actions";
import type { FineProposal, Player } from "@/lib/db-types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data: me } = await supabase
    .from("players")
    .select("entry_id, is_admin, display_name")
    .eq("user_id", user.id)
    .single();

  if (!me?.is_admin) {
    return (
      <div className="card p-6">
        <div className="kicker">Backstage</div>
        <h1 className="headline text-4xl mt-3 text-tabloid">Admins only.</h1>
        <p className="mt-2 italic text-sm">
          Ask the league admin to flip <code>is_admin=true</code> on your row in Supabase.
        </p>
      </div>
    );
  }

  const [{ data: proposals }, { data: players }] = await Promise.all([
    supabase.from("fine_proposals").select("*").order("proposed_at", { ascending: false }),
    supabase.from("players").select("entry_id, display_name, is_admin, user_id").order("display_name"),
  ]);

  const nameOf = (id: number) =>
    (players as Player[] | null)?.find((p) => p.entry_id === id)?.display_name ?? `#${id}`;

  const allProposals = (proposals ?? []) as FineProposal[];
  const allPlayers = (players ?? []) as Player[];

  return (
    <div className="space-y-8">
      <div>
        <div className="kicker">Editor&apos;s desk</div>
        <h1 className="headline text-4xl mt-3">ADMIN</h1>
      </div>

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
          To link a member to their auth account, run in Supabase SQL Editor:
          <br/>
          <code className="bg-bargain px-1">update players set user_id = (select id from auth.users where email = &apos;them@…&apos;) where entry_id = NNN;</code>
          <br/>
          To grant admin: <code className="bg-bargain px-1">update players set is_admin = true where entry_id = NNN;</code>
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper uppercase text-xs">
              <tr>
                <th className="px-2 py-2 text-left">Entry</th>
                <th className="px-2 py-2 text-left">Display name</th>
                <th className="px-2 py-2 text-left">Admin?</th>
                <th className="px-2 py-2 text-left">Linked?</th>
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
                  <td className="px-2 py-2">{p.is_admin ? "★" : ""}</td>
                  <td className="px-2 py-2">{p.user_id ? "✓" : "—"}</td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
