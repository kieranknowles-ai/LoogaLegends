import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { proposeEmoji, proposeFine } from "./actions";
import { COMMON_EMOJIS, GLOAT_REASON_LABELS } from "@/lib/db-types";

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
  const all = (players ?? []);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <div className="kicker">Anonymous tip-off</div>
        <h1 className="headline text-4xl mt-3">REPORT A CRIME</h1>
        <p className="mt-2 text-sm italic">
          Logged in as <strong>{session.display_name}</strong>. Pick gloat or emoji below.
          {session.is_admin && (
            <>
              {" "}For missed reports, head to <Link href="/admin" className="underline font-bold">admin</Link>.
            </>
          )}
        </p>
      </div>

      {/* GLOAT */}
      <div className="card p-6">
        <div className="kicker">A gloat</div>
        <h2 className="headline text-2xl mt-2">Propose a gloat — £1</h2>
        <p className="text-sm italic mt-1">
          Spotted boasting in the chat? Submit it. Another member must second within 7 days
          or it goes stale and the target gets away with it.
        </p>
        <form action={proposeFine} className="mt-3 space-y-4">
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

          <button type="submit" className="btn-primary w-full">Submit gloat for seconding</button>
        </form>
      </div>

      {/* EMOJI */}
      <div className="card p-6 bg-bargain">
        <div className="kicker">Emoji crime</div>
        <h2 className="headline text-2xl mt-2">Report an emoji — 50p</h2>
        <p className="text-sm italic mt-1">
          We don&apos;t believe in emojis. Pick the perpetrator (whoever used it),
          the date of the offence, and the offending emoji. Auto-applied — no seconding.
        </p>
        <form action={proposeEmoji} className="mt-3 space-y-4">
          <div>
            <label className="block text-xs uppercase font-bold tracking-widest mb-1">Perpetrator</label>
            <select name="target_entry" className="w-full border-3 border-ink p-2 bg-paper" required>
              <option value="">Pick the offender...</option>
              {all.map((p) => (
                <option key={p.entry_id} value={p.entry_id}>{p.display_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase font-bold tracking-widest mb-1">Date of offence</label>
            <input
              type="date"
              name="offence_date"
              defaultValue={today}
              max={today}
              required
              className="w-full border-3 border-ink p-2 bg-paper"
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-bold tracking-widest mb-1">
              Who provoked it? <span className="font-normal italic">(optional &mdash; assist credit)</span>
            </label>
            <select name="provoked_by" className="w-full border-3 border-ink p-2 bg-paper">
              <option value="">No one — perpetrator acted unprompted (charged double)</option>
              {all.map((p) => (
                <option key={p.entry_id} value={p.entry_id}>{p.display_name}</option>
              ))}
            </select>
            <p className="text-xs italic mt-1 text-ink/60">
              Unprompted emoji use is double the fine. If someone provoked it, name them and the perpetrator pays the standard £0.50.
            </p>
          </div>

          <div className="group">
            <label className="block text-xs uppercase font-bold tracking-widest mb-2">
              The offending emoji <span className="font-normal italic">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_EMOJIS.map((e) => (
                <label
                  key={e}
                  className="cursor-pointer border-3 border-ink bg-paper hover:bg-tabloid hover:text-paper px-3 py-2 text-2xl has-[:checked]:bg-tabloid has-[:checked]:text-paper"
                >
                  <input type="radio" name="emoji" value={e} className="sr-only" />
                  {e}
                </label>
              ))}
            </div>
            <div className="hidden group-has-[input:checked]:block mt-2 p-2 bg-tabloid text-paper text-sm text-center font-bold border-3 border-ink">
              There&apos;s no need for the emoji! Submitting with one selected will fine YOU 50p too.
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase font-bold tracking-widest mb-1">Note (optional)</label>
            <textarea
              name="note"
              rows={2}
              className="w-full border-3 border-ink p-2 bg-paper"
              placeholder="Where was it used?"
            />
          </div>

          <button type="submit" className="btn-primary w-full">Submit emoji fine</button>
        </form>
      </div>
    </div>
  );
}
