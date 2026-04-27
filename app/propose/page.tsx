import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { proposeFine } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProposePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/propose");

  const { data: me } = await supabase
    .from("players")
    .select("entry_id, display_name")
    .eq("user_id", user.id)
    .single();

  const { data: players } = await supabase
    .from("players")
    .select("entry_id, display_name")
    .order("display_name");

  const others = (players ?? []).filter((p) => p.entry_id !== me?.entry_id);
  const gws = Array.from({ length: 38 }, (_, i) => i + 1);

  return (
    <div className="max-w-xl mx-auto card p-6">
      <div className="kicker">Anonymous tip-off</div>
      <h1 className="headline text-4xl mt-3">PROPOSE A FINE</h1>
      {!me && (
        <p className="mt-3 p-3 bg-tabloid text-paper text-sm">
          Your account isn&apos;t linked to a league entry yet. Ask the admin to set <code>user_id</code> on your row.
        </p>
      )}
      <form action={proposeFine} className="mt-4 space-y-4">
        <div>
          <label className="block text-xs uppercase font-bold tracking-widest mb-1">Kind</label>
          <select name="kind" className="w-full border-3 border-ink p-2 bg-paper" required>
            <option value="gloat">Gloat (£1)</option>
            <option value="missed_report">Missed report (£10 × 1.5ⁿ)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase font-bold tracking-widest mb-1">Target</label>
          <select name="target_entry" className="w-full border-3 border-ink p-2 bg-paper" required>
            <option value="">Choose a victim...</option>
            {others.map((p) => (
              <option key={p.entry_id} value={p.entry_id}>{p.display_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase font-bold tracking-widest mb-1">
            Gameweek <span className="font-normal italic">(required for missed report, optional for gloat)</span>
          </label>
          <select name="gw" className="w-full border-3 border-ink p-2 bg-paper">
            <option value="">—</option>
            {gws.map((g) => <option key={g} value={g}>GW {g}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase font-bold tracking-widest mb-1">Note</label>
          <textarea name="note" rows={3} className="w-full border-3 border-ink p-2 bg-paper" placeholder="Quote the gloat. Be specific." />
        </div>
        <button type="submit" disabled={!me} className="btn-primary w-full">Submit for seconding</button>
      </form>
    </div>
  );
}
