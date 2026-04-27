import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "./supabase/admin";

const COOKIE_NAME = "looga_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET env var is required");
  return s;
}

function sign(payload: string): string {
  const sig = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verify(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  } catch {
    return null;
  }
  return payload;
}

export type Session = {
  entry_id: number;
  display_name: string;
  first_name: string | null;
  is_admin: boolean;
};

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const cookie = c.get(COOKIE_NAME)?.value;
  if (!cookie) return null;
  const payload = verify(cookie);
  if (!payload) return null;
  const entryId = Number(payload);
  if (!Number.isFinite(entryId)) return null;

  const admin = createAdminClient();
  const { data: player } = await admin
    .from("players")
    .select("entry_id, display_name, first_name, is_admin")
    .eq("entry_id", entryId)
    .single();
  return player ?? null;
}

export async function setSession(entryId: number) {
  const c = await cookies();
  c.set(COOKIE_NAME, sign(String(entryId)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearSession() {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}

// Password helpers — scrypt with random salt. Stored format: "<saltHex>:<hashHex>".
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = scryptSync(plain, salt, 32).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}
