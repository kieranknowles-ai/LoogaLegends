import { createClient as createSupabase } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS — only use in trusted server contexts (cron, admin scripts).
export function createAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
