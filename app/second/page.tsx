import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatGbp } from "@/lib/scoring";
import { secondProposal } from "./actions";
import type { FineProposal, Player } from "@/lib/db-types";

export const dynamic = "force-dynamic";

export default async function SecondPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/second");

  const { data: me } = await supabase
    .from("players")
    .select("entry_id, display_name")
    .eq("user_id", user.id)
    .single();

  const { data: pending } = await supabase
    .from("fine_proposals")
    .select("*")
    .is("seconded_at", null)
    .eq("voided", false)
    .order("proposed_at", { ascending: true });

  const { data: players } = await supabase
    .from("players")
    .select("entry_id, display_name");

  const nameOf = (id: number) =>
    (players as Pick<Player, "entry_id" | "display_name">[] | null)?.find((p) => p.entry_id === id)?.display_name ??
    `#${id}`;

  const proposals = (pending ?? []) as FineProposal[];

  const filtered = me
    ? proposals.filter((p) => p.target_entry !== me.entry_id && p.proposed_by !== me.entry_id)
    : proposals;

  return (
    <div className="space-y-4">
      <div>
        <div className="kicker">Jury duty</div>
        <h1 className="headline text-4xl mt-3">AWAITING SECOND</h1>
        <p className="mt-2 italic text-sm">
          A proposal becomes a fine the moment a second member rubber-stamps it. You can&apos;t second a fine against yourself or one you proposed.
        </p>
      </div>

      {filtered.length === 0 && (
        <div className="card p-6 text-center">
          <div className="headline text-2xl">All quiet on the front.</div>
          <div className="text-sm mt-2 italic text-ink/70">No proposals waiting for you.</div>
        </div>
      )}

      <div className="grid gap-3">
        {filtered.map((p) => (
          <div key={p.id} className="card p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-ink/60">
                {p.kind === "gloat" ? "Gloat" : `Missed report · GW ${p.gw}`} · proposed by {nameOf(p.proposed_by)}
              </div>
              <div className="headline text-2xl mt-1">
                {nameOf(p.target_entry)} <span className="text-tabloid">— {formatGbp(p.fine_p)}</span>
              </div>
              {p.note && <div className="mt-1 text-sm italic">&ldquo;{p.note}&rdquo;</div>}
            </div>
            <form action={secondProposal}>
              <input type="hidden" name="id" value={p.id} />
              <button className="btn-primary" type="submit">Second it</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
