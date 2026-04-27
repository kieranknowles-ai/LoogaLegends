import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { proposeFine } from "./actions";
import { GLOAT_REASON_LABELS } from "@/lib/db-types";

export const dynamic = "force-dynamic";

export default async function ProposePage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/propose");

  const admin = createAdminClient();
  const { data: players } = await admin
    .from("players")
    .select("entry_id, display_name")
    .order("display_name");

  const others = (players ?? []).filter((p) => p.entry_id !== session.entry_id);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-xl mx-auto card p-6">
      <div className="kicker">Anonymous tip-off</div>
      <h1 className="headline text-4xl mt-3">PROPOSE A GLOAT (£1)</h1>
      <p className="mt-2 text-sm italic">
        Logged in as <strong>{session.display_name}</strong>. Spotted a gloat in the chat?
        Submit it here. Another member then needs to{" "}
        <Link href="/second" className="underline">second</Link> it before the fine sticks.
        {session.is_admin && (
          <>
            {" "}For missed reports, head to <Link href="/admin" className="underline font-bold">admin</Link>.
          </>
        )}
      </p>
      <form action={proposeFine} className="mt-4 space-y-4">
        <input type="hidden" name="kind" value="gloat" />

        <div>
          <label className="block text-xs uppercase font-bold tracking-widest mb-1">Target</label>
          <select name="target_entry" className="w-full border-3 border-ink p-2 bg-paper" required>
            <option value="">Pick a victim...</option>
            {others.map((p) => (
              <option key={p.entry_id} value={p.entry_id}>{p.display_name}</option>
            ))}
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase font-bold tracking-widest mb-1">Date of gloat</label>
            <input
              type="date"
              name="gloat_date"
              defaultValue={today}
              max={today}
              required
              className="w-full border-3 border-ink p-2 bg-paper"
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-bold tracking-widest mb-1">Reason</label>
            <select name="gloat_reason" required className="w-full border-3 border-ink p-2 bg-paper">
              <option value="">Pick a reason...</option>
              {Object.entries(GLOAT_REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase font-bold tracking-widest mb-1">Quote / context</label>
          <textarea
            name="note"
            rows={3}
            className="w-full border-3 border-ink p-2 bg-paper"
            placeholder="Quote the gloat. Be specific."
          />
        </div>

        <button type="submit" className="btn-primary w-full">Submit for seconding</button>
      </form>
    </div>
  );
}
