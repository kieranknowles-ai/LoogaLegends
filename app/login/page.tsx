import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const session = await getSession();
  if (session) redirect(next || "/");

  return (
    <div className="max-w-md mx-auto card p-6">
      <div className="kicker">Members&apos; entrance</div>
      <h1 className="headline text-4xl mt-3">SIGN IN</h1>
      <p className="mt-2 text-sm italic">
        Type your first name and a password. First time? Whatever password you type
        becomes your password — write it down. Forgotten? Get Kieran to wipe it in Supabase.
      </p>
      <form action={login} className="mt-4 space-y-3">
        <label className="block text-xs uppercase font-bold tracking-widest">First name</label>
        <input
          name="first_name"
          required
          autoComplete="username"
          className="w-full border-3 border-ink p-2 bg-paper"
          placeholder="e.g. mark"
        />
        <label className="block text-xs uppercase font-bold tracking-widest">Password</label>
        <input
          type="password"
          name="password"
          required
          minLength={4}
          autoComplete="current-password"
          className="w-full border-3 border-ink p-2 bg-paper"
        />
        <input type="hidden" name="next" value={next ?? "/"} />
        <button type="submit" className="btn-primary w-full">Sign in</button>
      </form>
      {error && (
        <div className="mt-4 p-3 bg-tabloid text-paper border-3 border-ink text-sm">{error}</div>
      )}
    </div>
  );
}
