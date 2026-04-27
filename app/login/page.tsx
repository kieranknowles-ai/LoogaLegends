"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell><div className="p-3">Loading…</div></LoginShell>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-md mx-auto card p-6">
      <div className="kicker">Members&apos; entrance</div>
      <h1 className="headline text-4xl mt-3">SIGN IN</h1>
      <p className="mt-2 text-sm italic">
        We&apos;ll send a one-tap magic link. No passwords, no fuss.
      </p>
      {children}
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const params = useSearchParams();
  const next = params.get("next") || "/";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <LoginShell>
      <form onSubmit={send} className="mt-4 space-y-3">
        <label className="block text-xs uppercase font-bold tracking-widest">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border-3 border-ink p-2 bg-paper"
          placeholder="you@example.com"
        />
        <button type="submit" disabled={status === "sending"} className="btn-primary w-full">
          {status === "sending" ? "Sending..." : "Send magic link"}
        </button>
      </form>
      {status === "sent" && (
        <div className="mt-4 p-3 bg-bargain border-3 border-ink text-sm">
          Check your inbox. Click the link to sign in.
        </div>
      )}
      {status === "error" && (
        <div className="mt-4 p-3 bg-tabloid text-paper border-3 border-ink text-sm">
          {error}
        </div>
      )}
    </LoginShell>
  );
}
